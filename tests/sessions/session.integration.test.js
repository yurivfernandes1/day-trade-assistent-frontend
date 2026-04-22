/**
 * Testes de integração — US-B1/B2: Sessão de operação
 * - Valida integração UI: SessionControls + GoalForm + SessionToggle
 * - Valida persistência via useSession hook (mock do Supabase via jest.unstable_mockModule)
 */
import { jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── Supabase mock (top-level, antes de qualquer import dinâmico) ─────────────
const mockFrom = jest.fn();

await jest.unstable_mockModule('../../src/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
  },
}));

// Importações dinâmicas DEPOIS do mock
const { default: SessionControls } = await import('../../src/components/dashboard/SessionControls');
const { useSession } = await import('../../src/hooks/useSession');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function buildChain(resolveValue) {
  const chain = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.insert = jest.fn().mockReturnValue(chain);
  chain.update = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.single = jest.fn().mockResolvedValue(resolveValue);
  // Torna o chain awaitable (para terminal como .update().eq())
  chain.then = (resolve, reject) => Promise.resolve(resolveValue).then(resolve, reject);
  return chain;
}

// ─── Testes de UI (SessionControls apresentacional) ───────────────────────────
describe('SessionControls — testes de integração (UI)', () => {
  afterEach(() => jest.clearAllMocks());

  it('chama onStart com dados corretos ao submeter formulário', async () => {
    const onStart = jest.fn();
    render(<SessionControls activeSession={null} onStart={onStart} onStop={jest.fn()} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/meta de ganho/i), '3');
    await user.type(screen.getByLabelText(/limite de perda/i), '1.5');
    await user.click(screen.getByRole('button', { name: /iniciar sessão/i }));

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'paper',
        goal_type: 'percent',
        goal_profit: '3',
        goal_loss: '1.5',
      })
    );
  });

  it('não chama onStart quando metas são inválidas', async () => {
    const onStart = jest.fn();
    render(<SessionControls activeSession={null} onStart={onStart} onStop={jest.fn()} />);

    await userEvent.setup().click(screen.getByRole('button', { name: /iniciar sessão/i }));

    expect(onStart).not.toHaveBeenCalled();
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
  });

  it('troca modo para Real ao clicar no toggle Real', async () => {
    const onStart = jest.fn();
    render(<SessionControls activeSession={null} onStart={onStart} onStop={jest.fn()} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /real/i }));
    await user.type(screen.getByLabelText(/meta de ganho/i), '5');
    await user.type(screen.getByLabelText(/limite de perda/i), '2');
    await user.click(screen.getByRole('button', { name: /iniciar sessão/i }));

    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ mode: 'real' }));
  });

  it('exibe sessão ativa e permite parar', async () => {
    const onStop = jest.fn();
    const activeSession = {
      id: 'sess-1', mode: 'paper', goal_type: 'percent', goal_profit: 2, goal_loss: 1, status: 'active',
    };

    render(<SessionControls activeSession={activeSession} onStart={jest.fn()} onStop={onStop} />);

    expect(screen.getByText(/paper/i)).toBeInTheDocument();
    expect(screen.getByText('2%')).toBeInTheDocument();
    expect(screen.getByText('1%')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: /parar sessão/i }));
    expect(onStop).toHaveBeenCalled();
  });

  it('exibe metas em valor (R$) para sessão ativa', () => {
    const activeSession = {
      id: 'sess-2', mode: 'real', goal_type: 'value', goal_profit: 500, goal_loss: 200, status: 'active',
    };

    render(<SessionControls activeSession={activeSession} onStart={jest.fn()} onStop={jest.fn()} />);

    expect(screen.getByText('R$ 500.00')).toBeInTheDocument();
    expect(screen.getByText('R$ 200.00')).toBeInTheDocument();
  });
});

// ─── Testes de hook (useSession + Supabase mock) ──────────────────────────────
describe('useSession — testes de integração (hook + Supabase mock)', () => {
  afterEach(() => jest.clearAllMocks());

  it('startSession persiste no Supabase e atualiza activeSession', async () => {
    const { renderHook, act } = await import('@testing-library/react');

    const newSession = { id: 'new-sess', mode: 'paper', goal_type: 'percent', goal_profit: 2, goal_loss: 1, status: 'active' };

    mockFrom
      .mockReturnValueOnce(buildChain({ data: null, error: { code: 'PGRST116' } }))
      .mockReturnValue(buildChain({ data: newSession, error: null }));

    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      const res = await result.current.startSession({ mode: 'paper', goal_type: 'percent', goal_profit: 2, goal_loss: 1 });
      expect(res.success).toBe(true);
    });

    expect(result.current.activeSession).toEqual(newSession);
  });

  it('stopSession define activeSession como null após sucesso', async () => {
    const { renderHook, act } = await import('@testing-library/react');

    const existingSession = { id: 'sess-stop', mode: 'paper', goal_type: 'percent', goal_profit: 2, goal_loss: 1, status: 'active' };

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1
        ? buildChain({ data: existingSession, error: null })
        : buildChain({ data: null, error: null });
    });

    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      const res = await result.current.stopSession();
      expect(res.success).toBe(true);
    });

    expect(result.current.activeSession).toBeNull();
  });

  it('startSession retorna erro quando Supabase falha', async () => {
    const { renderHook, act } = await import('@testing-library/react');

    mockFrom
      .mockReturnValueOnce(buildChain({ data: null, error: { code: 'PGRST116' } }))
      .mockReturnValue(buildChain({ data: null, error: { message: 'Falha ao criar sessão.' } }));

    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      const res = await result.current.startSession({ mode: 'paper', goal_type: 'percent', goal_profit: 2, goal_loss: 1 });
      expect(res.success).toBe(false);
      expect(res.error).toBeTruthy();
    });

    expect(result.current.activeSession).toBeNull();
  });
});
