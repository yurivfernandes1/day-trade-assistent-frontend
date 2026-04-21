/**
 * Utilitários para mascaramento e validação de chaves de API.
 * A criptografia em repouso é responsabilidade do servidor (Supabase + pgcrypto).
 * No cliente, apenas mascaramos a exibição.
 */

/**
 * Mascara uma chave de API deixando apenas os últimos 4 caracteres visíveis.
 * @param {string} key
 * @returns {string}
 */
export function maskApiKey(key) {
  if (!key || typeof key !== 'string') return '';
  if (key.length <= 4) return '****';
  return `${'*'.repeat(Math.min(key.length - 4, 20))}${key.slice(-4)}`;
}

/**
 * Valida o formato de uma chave de API (mínimo 16 chars, sem espaços).
 * @param {string} key
 * @returns {{ valid: boolean; error?: string }}
 */
export function validateApiKey(key) {
  if (!key || typeof key !== 'string') {
    return { valid: false, error: 'Chave é obrigatória.' };
  }
  if (key.trim() !== key) {
    return { valid: false, error: 'Chave não pode conter espaços no início/fim.' };
  }
  if (key.length < 16) {
    return { valid: false, error: 'Chave deve ter pelo menos 16 caracteres.' };
  }
  if (key.length > 256) {
    return { valid: false, error: 'Chave deve ter no máximo 256 caracteres.' };
  }
  return { valid: true };
}

/**
 * Valida os campos do formulário de chave de API.
 * @param {{ label: string; broker: string; key_value: string; secret_value?: string }} fields
 * @returns {{ valid: boolean; errors: Record<string, string> }}
 */
export function validateApiKeyForm({ label, broker, key_value, secret_value }) {
  const errors = {};

  if (!label || label.trim().length === 0) {
    errors.label = 'Label é obrigatório.';
  }
  if (!broker || broker.trim().length === 0) {
    errors.broker = 'Broker é obrigatório.';
  }

  const keyValidation = validateApiKey(key_value);
  if (!keyValidation.valid) {
    errors.key_value = keyValidation.error;
  }

  if (secret_value !== undefined && secret_value !== '') {
    const secretValidation = validateApiKey(secret_value);
    if (!secretValidation.valid) {
      errors.secret_value = secretValidation.error;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
