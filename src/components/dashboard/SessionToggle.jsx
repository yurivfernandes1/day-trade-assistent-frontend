import { SESSION_MODES } from '../../lib/sessions';
import styles from './SessionToggle.module.css';

export default function SessionToggle({ mode, onChange, disabled = false }) {
  return (
    <div className={styles.wrapper} role="group" aria-label="Modo de operação">
      <button
        type="button"
        className={`${styles.option} ${mode === SESSION_MODES.PAPER ? styles.active : ''}`}
        onClick={() => onChange(SESSION_MODES.PAPER)}
        disabled={disabled}
        aria-pressed={mode === SESSION_MODES.PAPER}
      >
        Paper
      </button>
      <button
        type="button"
        className={`${styles.option} ${mode === SESSION_MODES.REAL ? styles.active : ''}`}
        onClick={() => onChange(SESSION_MODES.REAL)}
        disabled={disabled}
        aria-pressed={mode === SESSION_MODES.REAL}
        title="Disponível apenas após sessão Paper bem-sucedida e 2FA ativado"
      >
        Real
      </button>
    </div>
  );
}
