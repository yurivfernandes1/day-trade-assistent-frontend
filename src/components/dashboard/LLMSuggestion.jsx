import styles from './LLMSuggestion.module.css';

const ACTION_LABEL = {
  buy: 'Comprar',
  sell: 'Vender',
  hold: 'Aguardar',
};

/**
 * US-E1 — Componente de sugestão LLM (cold path, somente leitura).
 * Exibe a sugestão gerada pelo LLM e deixa a decisão com o usuário.
 */
export default function LLMSuggestion({
  suggestion,
  loading,
  error,
  onRequest,
  onClear,
  disabled = false,
}) {
  const action = suggestion?.suggested_action ?? 'hold';
  const badgeClass =
    action === 'buy'
      ? styles['badge-buy']
      : action === 'sell'
        ? styles['badge-sell']
        : styles['badge-hold'];

  return (
    <section className={styles['llm-suggestion']} aria-label="Sugestão de estratégia LLM">
      <div className={styles.header}>
        <span className={styles.title}>Sugestão LLM (apenas análise)</span>
        {suggestion && (
          <span className={`${styles.badge} ${badgeClass}`}>
            {ACTION_LABEL[action] ?? action}
          </span>
        )}
      </div>

      {loading && <p className={styles.loading}>Consultando LLM…</p>}

      {!loading && suggestion && (
        <>
          <p className={styles.rationale}>{suggestion.rationale}</p>
          {suggestion.confidence != null && (
            <p className={styles.confidence}>
              Confiança: {Math.round(suggestion.confidence * 100)}%
            </p>
          )}
          <aside className={styles.disclaimer} role="note">
            Esta é apenas uma sugestão. Nenhuma ordem será executada automaticamente.
            A decisão final é sempre sua.
          </aside>
        </>
      )}

      {!loading && error && (
        <p className={styles.error} role="alert">
          Erro ao consultar LLM: {error}
        </p>
      )}

      <div className={styles.actions}>
        <button
          className={styles.btnRequest}
          onClick={onRequest}
          disabled={disabled || loading}
          aria-busy={loading}
        >
          {loading ? 'Consultando…' : 'Pedir sugestão'}
        </button>
        {suggestion && (
          <button className={styles.btnClear} onClick={onClear} disabled={loading}>
            Limpar
          </button>
        )}
      </div>
    </section>
  );
}
