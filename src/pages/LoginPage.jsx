import { useNavigate } from 'react-router-dom';
import LoginForm from '../components/auth/LoginForm';
import styles from './LoginPage.module.css';

export default function LoginPage() {
  const navigate = useNavigate();

  return (
    <main className={styles.page}>
      <LoginForm onSuccess={() => navigate('/dashboard')} />
    </main>
  );
}
