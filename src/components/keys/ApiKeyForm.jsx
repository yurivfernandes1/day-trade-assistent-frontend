import { useState } from 'react';
import { validateApiKeyForm } from '../../lib/crypto';
import styles from './ApiKeyForm.module.css';

const BROKERS = ['Alpaca', 'Binance', 'Outro'];

export default function ApiKeyForm({ onSubmit, onCancel, loading = false }) {
  const [fields, setFields] = useState({
    label: '',
    broker: '',
    key_value: '',
    secret_value: '',
  });
  const [errors, setErrors] = useState({});

  function handleChange(e) {
    const { name, value } = e.target;
    setFields((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const { valid, errors: formErrors } = validateApiKeyForm(fields);
    if (!valid) {
      setErrors(formErrors);
      return;
    }
    await onSubmit(fields);
  }

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit}
      aria-label="Formulário de chave de API"
      noValidate
    >
      <div className={styles.field}>
        <label htmlFor="label">Label</label>
        <input
          id="label"
          name="label"
          type="text"
          value={fields.label}
          onChange={handleChange}
          placeholder="ex.: Alpaca Paper"
          aria-invalid={!!errors.label}
          aria-describedby={errors.label ? 'label-error' : undefined}
          disabled={loading}
        />
        {errors.label && (
          <span id="label-error" className={styles.error} role="alert">
            {errors.label}
          </span>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="broker">Broker</label>
        <select
          id="broker"
          name="broker"
          value={fields.broker}
          onChange={handleChange}
          aria-invalid={!!errors.broker}
          disabled={loading}
        >
          <option value="">Selecione…</option>
          {BROKERS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        {errors.broker && (
          <span className={styles.error} role="alert">
            {errors.broker}
          </span>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="key_value">API Key</label>
        <input
          id="key_value"
          name="key_value"
          type="password"
          value={fields.key_value}
          onChange={handleChange}
          placeholder="Chave de acesso"
          aria-invalid={!!errors.key_value}
          aria-describedby={errors.key_value ? 'key-error' : undefined}
          disabled={loading}
          autoComplete="new-password"
        />
        {errors.key_value && (
          <span id="key-error" className={styles.error} role="alert">
            {errors.key_value}
          </span>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="secret_value">Secret Key (opcional)</label>
        <input
          id="secret_value"
          name="secret_value"
          type="password"
          value={fields.secret_value}
          onChange={handleChange}
          placeholder="Chave secreta (se aplicável)"
          aria-invalid={!!errors.secret_value}
          disabled={loading}
          autoComplete="new-password"
        />
        {errors.secret_value && (
          <span className={styles.error} role="alert">
            {errors.secret_value}
          </span>
        )}
      </div>

      <div className={styles.actions}>
        <button type="button" onClick={onCancel} disabled={loading} className={styles.cancel}>
          Cancelar
        </button>
        <button type="submit" disabled={loading} className={styles.submit}>
          {loading ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
