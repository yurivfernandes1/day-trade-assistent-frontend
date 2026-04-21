import ApiKeyManager from '../components/keys/ApiKeyManager';
import styles from './ApiKeysPage.module.css';

export default function ApiKeysPage() {
  return (
    <main className={styles.page}>
      <ApiKeyManager />
    </main>
  );
}
