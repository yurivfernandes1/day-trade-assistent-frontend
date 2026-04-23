/**
 * US-E1 — LLM & Estratégia (cold path)
 *
 * Este módulo solicita sugestões ao LLM (Cloudflare AI), registra a resposta
 * no banco e garante que NENHUMA ordem é disparada automaticamente.
 * A decisão final sempre fica com o usuário.
 */

import { appendAuditEvent, AUDIT_EVENT_TYPE } from './auditLog.js';

export const SUGGESTION_STATUS = Object.freeze({
  PENDING: 'pending',
  RECEIVED: 'received',
  ERROR: 'error',
});

/**
 * Monta o prompt para o LLM a partir do contexto da sessão e notícias.
 *
 * @param {{ symbol: string, mode: string, recentNews: string[], positions: object[] }} context
 * @returns {string}
 */
export function buildStrategyPrompt({ symbol, mode, recentNews = [], positions = [] }) {
  const newsBlock =
    recentNews.length > 0
      ? `Notícias recentes:\n${recentNews.map((n, i) => `${i + 1}. ${n}`).join('\n')}`
      : 'Sem notícias recentes disponíveis.';

  const posBlock =
    positions.length > 0
      ? `Posições abertas:\n${JSON.stringify(positions, null, 2)}`
      : 'Sem posições abertas.';

  return [
    `Você é um assistente de análise para day trade no modo ${mode}.`,
    `Ativo: ${symbol}`,
    posBlock,
    newsBlock,
    'Forneça uma sugestão de estratégia com justificativa. Não emita ordens — apenas analise.',
    'Responda em JSON: { "rationale": "...", "suggestedAction": "buy|sell|hold", "confidence": 0..1 }',
  ].join('\n\n');
}

/**
 * Chama o LLM via Cloudflare AI Gateway.
 * Em testes, injete `fetchFn` com um mock.
 *
 * @param {string} prompt
 * @param {{ baseUrl: string, model: string, apiToken: string }} config
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<{ rationale: string, suggestedAction: string, confidence: number }>}
 */
export async function callLLM(prompt, config, fetchFn = fetch) {
  const { baseUrl, model, apiToken } = config;
  const url = `${baseUrl}/${model}`;

  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM request failed [${response.status}]: ${text}`);
  }

  const raw = await response.json();
  // Cloudflare AI retorna { result: { response: "..." } }
  const responseText = raw?.result?.response ?? raw?.response ?? '';

  try {
    return JSON.parse(responseText);
  } catch {
    // fallback se o LLM não retornar JSON válido
    return { rationale: responseText, suggestedAction: 'hold', confidence: 0 };
  }
}

/**
 * Persiste a sugestão LLM na tabela `llm_suggestions` do Supabase.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ session_id: string, user_id: string, symbol: string,
 *           prompt: string, rationale: string, suggested_action: string,
 *           confidence: number, status: string }} suggestionData
 * @returns {Promise<object>}
 */
export async function persistSuggestion(supabase, suggestionData) {
  const { data, error } = await supabase
    .from('llm_suggestions')
    .insert([suggestionData])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Fluxo completo: monta prompt → chama LLM → persiste sugestão.
 * Não executa ordens. Retorna o registro persistido.
 *
 * @param {object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.supabase
 * @param {{ session_id: string, user_id: string, symbol: string,
 *           mode: string, recentNews?: string[], positions?: object[] }} params.context
 * @param {{ baseUrl: string, model: string, apiToken: string }} params.llmConfig
 * @param {typeof fetch} [params.fetchFn]
 * @returns {Promise<object>} registro da sugestão persistida
 */
export async function requestStrategySuggestion({ supabase, context, llmConfig, fetchFn }) {
  const { session_id, user_id, symbol, mode, recentNews = [], positions = [] } = context;

  const prompt = buildStrategyPrompt({ symbol, mode, recentNews, positions });

  let llmResult;
  let status = SUGGESTION_STATUS.RECEIVED;

  try {
    llmResult = await callLLM(prompt, llmConfig, fetchFn);
  } catch (err) {
    llmResult = { rationale: err.message, suggestedAction: 'hold', confidence: 0 };
    status = SUGGESTION_STATUS.ERROR;
  }

  const saved = await persistSuggestion(supabase, {
    session_id,
    user_id,
    symbol,
    prompt,
    rationale: llmResult.rationale,
    suggested_action: llmResult.suggestedAction,
    confidence: llmResult.confidence,
    status,
  });

  // Audit: sugestão LLM registrada (não bloqueia o fluxo em caso de falha)
  const auditEventType = status === SUGGESTION_STATUS.ERROR
    ? AUDIT_EVENT_TYPE.LLM_SUGGESTION_ERROR
    : AUDIT_EVENT_TYPE.LLM_SUGGESTION_RECEIVED;

  appendAuditEvent(supabase, {
    event_type: auditEventType,
    user_id,
    session_id,
    entity_id: saved.id,
    entity_type: 'llm_suggestion',
    payload: {
      symbol,
      suggested_action: llmResult.suggestedAction,
      confidence: llmResult.confidence,
      status,
    },
  }).catch(() => { /* audit failure não bloqueia o fluxo */ });

  return saved;
}
