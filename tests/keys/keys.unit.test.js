import { maskApiKey, validateApiKey, validateApiKeyForm } from '../../src/lib/crypto';

describe('maskApiKey', () => {
  it('retorna string vazia para entrada inválida', () => {
    expect(maskApiKey('')).toBe('');
    expect(maskApiKey(null)).toBe('');
    expect(maskApiKey(undefined)).toBe('');
  });

  it('mascara chave deixando apenas os últimos 4 caracteres', () => {
    const masked = maskApiKey('ABCDEFGHIJKLMNOP');
    expect(masked).toMatch(/\*+MNOP$/);
    expect(masked).not.toContain('ABCDEFGHIJ');
  });

  it('retorna **** para chaves com 4 chars ou menos', () => {
    expect(maskApiKey('ABCD')).toBe('****');
    expect(maskApiKey('AB')).toBe('****');
  });

  it('não excede 24 caracteres de asteriscos', () => {
    const longKey = 'A'.repeat(100) + 'BCDE';
    const masked = maskApiKey(longKey);
    expect(masked.endsWith('BCDE')).toBe(true);
    const asterisks = masked.replace(/[^*]/g, '');
    expect(asterisks.length).toBeLessThanOrEqual(24);
  });
});

describe('validateApiKey', () => {
  it('retorna erro para chave ausente', () => {
    expect(validateApiKey('').valid).toBe(false);
    expect(validateApiKey(null).valid).toBe(false);
  });

  it('retorna erro para chave com espaços', () => {
    const result = validateApiKey(' abc ');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/espaços/i);
  });

  it('retorna erro para chave menor que 16 caracteres', () => {
    const result = validateApiKey('shortkey');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/16/);
  });

  it('retorna válido para chave com 16+ caracteres sem espaços', () => {
    expect(validateApiKey('ABCDEFGHIJKLMNOP').valid).toBe(true);
  });

  it('retorna erro para chave maior que 256 caracteres', () => {
    const result = validateApiKey('A'.repeat(257));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/256/);
  });
});

describe('validateApiKeyForm', () => {
  const validForm = {
    label: 'Alpaca Paper',
    broker: 'Alpaca',
    key_value: 'PKTEST12345678901',
    secret_value: '',
  };

  it('retorna válido para formulário correto', () => {
    const result = validateApiKeyForm(validForm);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('retorna erro para label vazio', () => {
    const result = validateApiKeyForm({ ...validForm, label: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.label).toBeTruthy();
  });

  it('retorna erro para broker vazio', () => {
    const result = validateApiKeyForm({ ...validForm, broker: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.broker).toBeTruthy();
  });

  it('retorna erro para key_value inválida', () => {
    const result = validateApiKeyForm({ ...validForm, key_value: 'curta' });
    expect(result.valid).toBe(false);
    expect(result.errors.key_value).toBeTruthy();
  });

  it('valida secret_value quando preenchido', () => {
    const result = validateApiKeyForm({ ...validForm, secret_value: 'inv' });
    expect(result.valid).toBe(false);
    expect(result.errors.secret_value).toBeTruthy();
  });

  it('aceita secret_value válido quando preenchido', () => {
    const result = validateApiKeyForm({
      ...validForm,
      secret_value: 'SECRETABCDEF1234',
    });
    expect(result.valid).toBe(true);
  });
});
