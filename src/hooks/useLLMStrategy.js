import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { requestStrategySuggestion } from '../lib/llmStrategy';

const LLM_CONFIG = {
  baseUrl: import.meta.env.VITE_CLOUDFLARE_AI_BASE_URL,
  model: import.meta.env.VITE_CLOUDFLARE_AI_MODEL ?? '@cf/meta/llama-3-8b-instruct',
  apiToken: import.meta.env.VITE_CLOUDFLARE_AI_TOKEN,
};

/**
 * Hook para solicitar sugestões de estratégia ao LLM (cold path).
 * Não executa ordens — apenas retorna a sugestão para o usuário decidir.
 */
export function useLLMStrategy() {
  const [suggestion, setSuggestion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const requestSuggestion = useCallback(
    async ({ sessionId, userId, symbol, mode, recentNews = [], positions = [] }) => {
      setLoading(true);
      setError(null);

      try {
        const result = await requestStrategySuggestion({
          supabase,
          context: {
            session_id: sessionId,
            user_id: userId,
            symbol,
            mode,
            recentNews,
            positions,
          },
          llmConfig: LLM_CONFIG,
        });
        setSuggestion(result);
        return result;
      } catch (err) {
        setError(err.message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearSuggestion = useCallback(() => {
    setSuggestion(null);
    setError(null);
  }, []);

  return { suggestion, loading, error, requestSuggestion, clearSuggestion };
}
