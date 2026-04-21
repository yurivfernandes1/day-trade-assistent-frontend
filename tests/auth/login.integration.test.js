/**
 * Teste de integração — US-A1: Login
 * Usa MSW (mock service worker) para interceptar chamadas ao Supabase.
 * Sem chamadas reais à API.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import LoginForm from '../../src/components/auth/LoginForm';

// Mock completo do módulo supabase para evitar import.meta.env
jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
    },
  },
}));

import { supabase } from '../../src/lib/supabase';

describe('LoginForm — testes de integração', () => {
  afterEach(() => jest.clearAllMocks());

  it('autentica e retorna sessão quando credenciais são válidas', async () => {
    const fakeUser = { id: 'user-1', email: 'user@example.com' };
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: fakeUser, session: { access_token: 'tok123' } },
      error: null,
    });

    const onSuccess = jest.fn();
    render(<LoginForm onSuccess={onSuccess} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/e-mail/i), 'user@example.com');
    await user.type(screen.getByLabelText(/senha/i), 'senha123');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'senha123',
      });
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('exibe mensagem de erro quando Supabase retorna erro', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });

    render(<LoginForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/e-mail/i), 'user@example.com');
    await user.type(screen.getByLabelText(/senha/i), 'senhaErrada');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByText(/invalid login credentials/i)).toBeInTheDocument();
  });
});
