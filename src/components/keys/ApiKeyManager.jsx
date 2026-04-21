import { useState } from 'react';
import { useApiKeys } from '../../hooks/useApiKeys';
import ApiKeyCard from './ApiKeyCard';
import ApiKeyForm from './ApiKeyForm';
import styles from './ApiKeyManager.module.css';

export default function ApiKeyManager() {
  const { keys, loading, error, createKey, updateKey, deleteKey } = useApiKeys();
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  async function handleCreate(fields) {
    setSubmitting(true);
    setFormError('');
    const result = await createKey(fields);
    setSubmitting(false);
    if (!result.success) {
      setFormError(result.error);
      return;
    }
    setShowForm(false);
  }

  async function handleDelete(id) {
    if (!window.confirm('Remover esta chave de API?')) return;
    await deleteKey(id);
  }

  async function handleEdit(id) {
    // Abre modal de edição de label/broker (sem re-expor a chave)
    const key = keys.find((k) => k.id === id);
    if (!key) return;
    const label = window.prompt('Novo label:', key.label);
    if (label === null) return;
    await updateKey(id, { label, broker: key.broker });
  }

  return (
    <section className={styles.container} aria-label="Chaves de API">
      <header className={styles.header}>
        <h2>Chaves de API</h2>
        <button
          className={styles.addBtn}
          onClick={() => {
            setFormError('');
            setShowForm(true);
          }}
          disabled={loading || submitting}
        >
          + Adicionar
        </button>
      </header>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {showForm && (
        <div className={styles.formWrapper}>
          {formError && (
            <p className={styles.error} role="alert">
              {formError}
            </p>
          )}
          <ApiKeyForm
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
            loading={submitting}
          />
        </div>
      )}

      {loading && !keys.length ? (
        <p className={styles.loading}>Carregando…</p>
      ) : keys.length === 0 ? (
        <p className={styles.empty}>Nenhuma chave cadastrada.</p>
      ) : (
        <ul className={styles.list}>
          {keys.map((key) => (
            <li key={key.id}>
              <ApiKeyCard
                apiKey={key}
                onDelete={handleDelete}
                onEdit={handleEdit}
                disabled={loading || submitting}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
