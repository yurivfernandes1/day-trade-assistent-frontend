import { jest } from '@jest/globals';
/**
 * US-E1 — Integration tests: LLM Strategy suggestion
 *
 * Verifica que:
 * 1. A sugestão é gerada e persistida no Supabase.
 * 2. Nenhuma ordem é disparada como efeito colateral.
 * 3. O fluxo de erro (LLM indisponível) persiste registro com status=error.
 */

import {
  buildStrategyPrompt,
  callLLM,
  persistSuggestion,
  requestStrategySuggestion,
  SUGGESTION_STATUS,
} from '../../src/lib/llmStrategy';

// ── Supabase mock ────────────────────────────────────────────────────────────
const mockInsert = jest.fn();
const mockSupabase = {
  from: jest.fn(() => ({
    insert: mockInsert.mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 'sug-1', status: SUGGESTION_STATUS.RECEIVED }, error: null }),
      }),
    }),
  })),
};

// ── fetch mock para LLM ──────────────────────────────────────────────────────
const validLLMResponse = {
  result: {
    response: JSON.stringify({
      rationale: 'Mercado em alta; volume crescente favorece compra.',
      suggestedAction: 'buy',
      confidence: 0.78,
    }),
  },
};

function makeFetchMock(responsePayload, status = 200) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(responsePayload),
    text: () => Promise.resolve(JSON.stringify(responsePayload)),
  });
}

const LLM_CONFIG = {
  baseUrl: 'https://api.cloudflare.test/ai',
  model: '@cf/meta/llama-3-8b-instruct',
  apiToken: 'test-token',
};

// ── Spy para garantir que orders NÃO é chamado ───────────────────────────────
const mockOrdersSpy = jest.fn();
jest.unstable_mockModule('../../src/lib/orders', () => ({ persistOrder: mockOrdersSpy }));

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Testes ───────────────────────────────────────────────────────────────────

describe('buildStrategyPrompt', () => {
  it('inclui símbolo e modo no prompt', () => {
    const prompt = buildStrategyPrompt({ symbol: 'BTC/USDT', mode: 'paper' });
    expect(prompt).toContain('BTC/USDT');
    expect(prompt).toContain('paper');
  });

  it('inclui notícias quando fornecidas', () => {
    const prompt = buildStrategyPrompt({
      symbol: 'ETH/USDT',
      mode: 'paper',
      recentNews: ['Fed sobe juros 0.25%', 'Bitcoin bate recorde'],
    });
    expect(prompt).toContain('Fed sobe juros');
    expect(prompt).toContain('Bitcoin bate recorde');
  });

  it('inclui mensagem de fallback quando sem notícias', () => {
    const prompt = buildStrategyPrompt({ symbol: 'ETH/USDT', mode: 'paper', recentNews: [] });
    expect(prompt).toContain('Sem notícias recentes');
  });
});

describe('callLLM', () => {
  it('retorna sugestão parseada do LLM', async () => {
    const fetchMock = makeFetchMock(validLLMResponse);
    const result = await callLLM('prompt de teste', LLM_CONFIG, fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('@cf/meta/llama-3-8b-instruct'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      })
    );
    expect(result).toMatchObject({
      rationale: expect.any(String),
      suggestedAction: 'buy',
      confidence: 0.78,
    });
  });

  it('retorna hold com confidence=0 quando LLM retorna JSON inválido', async () => {
    const fetchMock = makeFetchMock({ result: { response: 'texto livre sem JSON' } });
    const result = await callLLM('prompt', LLM_CONFIG, fetchMock);

    expect(result.suggestedAction).toBe('hold');
    expect(result.confidence).toBe(0);
  });

  it('lança erro quando status HTTP não é 2xx', async () => {
    const fetchMock = makeFetchMock({ error: 'Unauthorized' }, 401);
    await expect(callLLM('prompt', LLM_CONFIG, fetchMock)).rejects.toThrow('401');
  });
});

describe('persistSuggestion', () => {
  it('insere o registro no Supabase e retorna o dado persistido', async () => {
    const data = {
      session_id: 'sess-1',
      user_id: 'user-1',
      symbol: 'BTC/USDT',
      prompt: 'prompt',
      rationale: 'análise',
      suggested_action: 'buy',
      confidence: 0.8,
      status: SUGGESTION_STATUS.RECEIVED,
    };

    const result = await persistSuggestion(mockSupabase, data);

    expect(mockSupabase.from).toHaveBeenCalledWith('llm_suggestions');
    expect(mockInsert).toHaveBeenCalledWith([data]);
    expect(result).toHaveProperty('id', 'sug-1');
  });

  it('lança erro quando Supabase retorna erro', async () => {
    const errorSupabase = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: { message: 'RLS violation' } }),
          }),
        }),
      }),
    };

    await expect(
      persistSuggestion(errorSupabase, { session_id: 'x', user_id: 'x', symbol: 'x', prompt: 'x',
        rationale: 'x', suggested_action: 'hold', confidence: 0, status: SUGGESTION_STATUS.ERROR })
    ).rejects.toThrow('RLS violation');
  });
});

describe('requestStrategySuggestion — integração completa', () => {
  it('persiste sugestão e NÃO dispara ordens', async () => {
    const fetchMock = makeFetchMock(validLLMResponse);

    const result = await requestStrategySuggestion({
      supabase: mockSupabase,
      context: {
        session_id: 'sess-1',
        user_id: 'user-1',
        symbol: 'BTC/USDT',
        mode: 'paper',
        recentNews: ['Notícia A'],
        positions: [],
      },
      llmConfig: LLM_CONFIG,
      fetchFn: fetchMock,
    });

    // Sugestão foi persistida
    expect(mockSupabase.from).toHaveBeenCalledWith('llm_suggestions');
    expect(result).toHaveProperty('id', 'sug-1');

    // Ordens NÃO foram disparadas
    expect(mockOrdersSpy).not.toHaveBeenCalled();
  });

  it('persiste com status=error quando LLM falha, sem disparar ordens', async () => {
    const failFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('Service Unavailable'),
    });

    // Ajustar mock para retornar status=error
    const errorSupabase = {
      from: jest.fn(() => ({
        insert: jest.fn().mockReturnValue({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { id: 'sug-err', status: SUGGESTION_STATUS.ERROR },
                error: null,
              }),
          }),
        }),
      })),
    };

    const result = await requestStrategySuggestion({
      supabase: errorSupabase,
      context: {
        session_id: 'sess-1',
        user_id: 'user-1',
        symbol: 'BTC/USDT',
        mode: 'paper',
      },
      llmConfig: LLM_CONFIG,
      fetchFn: failFetch,
    });

    expect(result).toHaveProperty('status', SUGGESTION_STATUS.ERROR);
    expect(mockOrdersSpy).not.toHaveBeenCalled();
  });

  it('dispara evento de auditoria LLM_SUGGESTION_RECEIVED após sugestão bem-sucedida', async () => {
    const fetchMock = makeFetchMock(validLLMResponse);
    const auditInserts = [];
    const auditAwareMock = {
      from: jest.fn((table) => ({
        insert: jest.fn((records) => {
          if (table === 'audit_events') auditInserts.push(...records);
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: table === 'audit_events' ? 'audit-1' : 'sug-2', status: SUGGESTION_STATUS.RECEIVED },
                  error: null,
                }),
            }),
          };
        }),
      })),
    };

    await requestStrategySuggestion({
      supabase: auditAwareMock,
      context: { session_id: 'sess-1', user_id: 'user-1', symbol: 'BTC/USDT', mode: 'paper' },
      llmConfig: LLM_CONFIG,
      fetchFn: fetchMock,
    });

    // Aguarda o evento de auditoria (é disparado de forma async com .catch)
    await new Promise((r) => setTimeout(r, 0));

    expect(auditInserts.length).toBeGreaterThan(0);
    expect(auditInserts[0].event_type).toBe('llm.suggestion_received');
    expect(auditInserts[0].user_id).toBe('user-1');
    expect(auditInserts[0].entity_type).toBe('llm_suggestion');
  });
});
