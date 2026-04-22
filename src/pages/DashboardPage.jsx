import { useAuth } from '../hooks/useAuth';
import { useSession } from '../hooks/useSession';
import { Navigate, Link } from 'react-router-dom';
import SessionControls from '../components/dashboard/SessionControls';
import styles from './DashboardPage.module.css';

export default function DashboardPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { activeSession, loading: sessionLoading, error: sessionError, startSession, stopSession } = useSession();

  if (authLoading) return <p>Carregando…</p>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Dashboard</h1>
        <div className={styles.nav}>
          <Link to="/settings/api-keys">Chaves de API</Link>
          <button onClick={signOut} className={styles.signOut}>
            Sair
          </button>
        </div>
      </header>
      <p className={styles.welcome}>Bem-vindo, {user.email}</p>

      {sessionError && (
        <p className={styles.sessionError} role="alert">
          {sessionError}
        </p>
      )}

      <section className={styles.sessionSection} aria-label="Controles de sessão">
        {sessionLoading && !activeSession ? (
          <p className={styles.sessionLoading}>Carregando sessão…</p>
        ) : (
          <SessionControls
            activeSession={activeSession}
            onStart={startSession}
            onStop={stopSession}
            loading={sessionLoading}
          />
        )}
      </section>
    </main>
  );
}
