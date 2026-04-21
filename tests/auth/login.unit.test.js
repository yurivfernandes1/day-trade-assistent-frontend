import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginForm from '../../src/components/auth/LoginForm';

// Mock do hook de autenticação
jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

import { useAuth } from '../../src/hooks/useAuth';

describe('LoginForm — testes unitários', () => {
  const mockSignIn = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({
      signIn: mockSignIn,
      loading: false,
    });
  });

  it('renderiza campos de email e senha', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
  });

  it('exibe erro de validação para email inválido', async () => {
    render(<LoginForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/e-mail/i), 'email-invalido');
    await user.type(screen.getByLabelText(/senha/i), 'senha123');
    await user.click(screen.getByRole('button', { name: /entrar/i }));
    expect(await screen.findByText(/e-mail válido/i)).toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('exibe erro de validação para senha curta', async () => {
    render(<LoginForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/e-mail/i), 'user@example.com');
    await user.type(screen.getByLabelText(/senha/i), '123');
    await user.click(screen.getByRole('button', { name: /entrar/i }));
    expect(await screen.findByText(/ao menos 6 caracteres/i)).toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('não exibe erros quando form é válido e chama signIn', async () => {
    mockSignIn.mockResolvedValue({ success: true, user: { email: 'user@example.com' } });
    render(<LoginForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/e-mail/i), 'user@example.com');
    await user.type(screen.getByLabelText(/senha/i), 'senha123');
    await user.click(screen.getByRole('button', { name: /entrar/i }));
    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'senha123',
      });
    });
  });

  it('exibe erro do servidor quando signIn falha', async () => {
    mockSignIn.mockResolvedValue({ success: false, error: 'Credenciais inválidas.' });
    render(<LoginForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/e-mail/i), 'user@example.com');
    await user.type(screen.getByLabelText(/senha/i), 'senha123');
    await user.click(screen.getByRole('button', { name: /entrar/i }));
    expect(await screen.findByText(/credenciais inválidas/i)).toBeInTheDocument();
  });

  it('chama onSuccess após login bem-sucedido', async () => {
    const onSuccess = jest.fn();
    mockSignIn.mockResolvedValue({ success: true, user: { email: 'user@example.com' } });
    render(<LoginForm onSuccess={onSuccess} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/e-mail/i), 'user@example.com');
    await user.type(screen.getByLabelText(/senha/i), 'senha123');
    await user.click(screen.getByRole('button', { name: /entrar/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('desabilita o botão durante o carregamento', () => {
    useAuth.mockReturnValue({ signIn: mockSignIn, loading: true });
    render(<LoginForm />);
    expect(screen.getByRole('button', { name: /entrando/i })).toBeDisabled();
  });
});
