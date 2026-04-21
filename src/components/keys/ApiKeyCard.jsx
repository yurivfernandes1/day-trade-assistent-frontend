import styles from './ApiKeyCard.module.css';

export default function ApiKeyCard({ apiKey, onDelete, onEdit, disabled = false }) {
  const { id, label, broker, key_masked, created_at } = apiKey;

  return (
    <article className={styles.card} aria-label={`Chave: ${label}`}>
      <div className={styles.info}>
        <span className={styles.label}>{label}</span>
        <span className={styles.broker}>{broker}</span>
        <code className={styles.mask}>{key_masked ?? '****************'}</code>
        <time className={styles.date} dateTime={created_at}>
          {new Date(created_at).toLocaleDateString('pt-BR')}
        </time>
      </div>
      <div className={styles.actions}>
        <button
          aria-label={`Editar chave ${label}`}
          onClick={() => onEdit(id)}
          disabled={disabled}
          title="Editar"
        >
          ✏️
        </button>
        <button
          aria-label={`Remover chave ${label}`}
          onClick={() => onDelete(id)}
          disabled={disabled}
          title="Remover"
          className={styles.deleteBtn}
        >
          🗑️
        </button>
      </div>
    </article>
  );
}
