import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import styles from './LoginForm.module.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateForm({ email, password }) {
  const errors = {};
  if (!email || !EMAIL_REGEX.test(email)) {
    errors.email = 'Informe um e-mail válido.';
  }
  if (!password || password.length < 6) {
    errors.password = 'Senha deve ter ao menos 6 caracteres.';
  }
  return errors;
}

export default function LoginForm({ onSuccess }) {
  const { signIn, loading } = useAuth();
  const [fields, setFields] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');

  function handleChange(e) {
    const { name, value } = e.target;
    setFields((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError('');

    const errors = validateForm(fields);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const result = await signIn({ email: fields.email, password: fields.password });
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    onSuccess?.();
  }

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit}
      aria-label="Formulário de login"
      noValidate
    >
      <h1 className={styles.title}>Entrar</h1>

      <div className={styles.field}>
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={fields.email}
          onChange={handleChange}
          aria-invalid={!!fieldErrors.email}
          aria-describedby={fieldErrors.email ? 'email-error' : undefined}
          disabled={loading}
        />
        {fieldErrors.email && (
          <span id="email-error" className={styles.error} role="alert">
            {fieldErrors.email}
          </span>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="password">Senha</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={fields.password}
          onChange={handleChange}
          aria-invalid={!!fieldErrors.password}
          aria-describedby={fieldErrors.password ? 'password-error' : undefined}
          disabled={loading}
        />
        {fieldErrors.password && (
          <span id="password-error" className={styles.error} role="alert">
            {fieldErrors.password}
          </span>
        )}
      </div>

      {serverError && (
        <p className={styles.serverError} role="alert">
          {serverError}
        </p>
      )}

      <button type="submit" disabled={loading} className={styles.submit}>
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
