import { useState } from 'react';
import SessionToggle from './SessionToggle';
import GoalForm from './GoalForm';
import { SESSION_MODES, GOAL_TYPES } from '../../lib/sessions';
import styles from './SessionControls.module.css';

export default function SessionControls({ activeSession, onStart, onStop, loading = false }) {
  const [mode, setMode] = useState(SESSION_MODES.PAPER);

  if (activeSession) {
    const { mode: sessionMode, goal_type, goal_profit, goal_loss } = activeSession;
    const fmt = (val) =>
      goal_type === GOAL_TYPES.PERCENT ? `${val}%` : `R$ ${Number(val).toFixed(2)}`;

    return (
      <div className={styles.activeSession}>
        <div className={styles.statusBadge}>
          <span className={`${styles.dot} ${styles.dotActive}`} aria-hidden="true" />
          Sessão <strong>{sessionMode === SESSION_MODES.PAPER ? 'Paper' : 'Real'}</strong> em andamento
        </div>
        <dl className={styles.goals}>
          <div className={styles.goalItem}>
            <dt>Ganho alvo</dt>
            <dd>{fmt(goal_profit)}</dd>
          </div>
          <div className={styles.goalItem}>
            <dt>Stop de perda</dt>
            <dd>{fmt(goal_loss)}</dd>
          </div>
        </dl>
        <button
          className={styles.stopBtn}
          onClick={onStop}
          disabled={loading}
          aria-label="Parar sessão"
        >
          {loading ? 'Parando…' : '⬛ Stop'}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.newSession}>
      <h2 className={styles.title}>Nova sessão</h2>
      <SessionToggle mode={mode} onChange={setMode} disabled={loading} />
      <GoalForm onSubmit={(goals) => onStart({ mode, ...goals })} disabled={loading} />
    </div>
  );
}
