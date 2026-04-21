import { useAuth } from '../hooks/useAuth';
import { Navigate, Link } from 'react-router-dom';
import styles from './DashboardPage.module.css';

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();

  if (loading) return <p>Carregando…</p>;
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
    </main>
  );
}
