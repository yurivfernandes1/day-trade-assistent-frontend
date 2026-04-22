/**
 * Testes unitários — US-B1: SessionToggle e SessionControls
 */
import { jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SessionToggle from '../../src/components/dashboard/SessionToggle';
import SessionControls from '../../src/components/dashboard/SessionControls';
import { SESSION_MODES, GOAL_TYPES } from '../../src/lib/sessions';

describe('SessionToggle — testes unitários', () => {
  it('renderiza botões Paper e Real', () => {
    render(<SessionToggle mode={SESSION_MODES.PAPER} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: /paper/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /real/i })).toBeInTheDocument();
  });

  it('botão Paper tem aria-pressed=true quando mode=paper', () => {
    render(<SessionToggle mode={SESSION_MODES.PAPER} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: /paper/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /real/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('botão Real tem aria-pressed=true quando mode=real', () => {
    render(<SessionToggle mode={SESSION_MODES.REAL} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: /real/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /paper/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('chama onChange com REAL ao clicar em Real', async () => {
    const onChange = jest.fn();
    render(<SessionToggle mode={SESSION_MODES.PAPER} onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /real/i }));
    expect(onChange).toHaveBeenCalledWith(SESSION_MODES.REAL);
  });

  it('chama onChange com PAPER ao clicar em Paper', async () => {
    const onChange = jest.fn();
    render(<SessionToggle mode={SESSION_MODES.REAL} onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /paper/i }));
    expect(onChange).toHaveBeenCalledWith(SESSION_MODES.PAPER);
  });

  it('desabilita ambos os botões quando disabled=true', () => {
    render(<SessionToggle mode={SESSION_MODES.PAPER} onChange={jest.fn()} disabled />);
    expect(screen.getByRole('button', { name: /paper/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /real/i })).toBeDisabled();
  });
});

describe('SessionControls — exibe sessão ativa', () => {
  const activeSession = {
    id: 'sess-1',
    mode: SESSION_MODES.PAPER,
    goal_type: GOAL_TYPES.PERCENT,
    goal_profit: 2.5,
    goal_loss: 1.5,
    status: 'active',
  };

  it('exibe badge de sessão ativa com modo Paper', () => {
    render(
      <SessionControls
        activeSession={activeSession}
        onStart={jest.fn()}
        onStop={jest.fn()}
      />
    );
    expect(screen.getByText(/sessão/i)).toBeInTheDocument();
    expect(screen.getByText(/paper/i)).toBeInTheDocument();
  });

  it('exibe metas formatadas em percentual', () => {
    render(
      <SessionControls
        activeSession={activeSession}
        onStart={jest.fn()}
        onStop={jest.fn()}
      />
    );
    expect(screen.getByText('2.5%')).toBeInTheDocument();
    expect(screen.getByText('1.5%')).toBeInTheDocument();
  });

  it('exibe metas formatadas em valor (R$)', () => {
    const session = { ...activeSession, goal_type: GOAL_TYPES.VALUE, goal_profit: 500, goal_loss: 200 };
    render(
      <SessionControls
        activeSession={session}
        onStart={jest.fn()}
        onStop={jest.fn()}
      />
    );
    expect(screen.getByText('R$ 500.00')).toBeInTheDocument();
    expect(screen.getByText('R$ 200.00')).toBeInTheDocument();
  });

  it('chama onStop ao clicar em Stop', async () => {
    const onStop = jest.fn();
    render(
      <SessionControls
        activeSession={activeSession}
        onStart={jest.fn()}
        onStop={onStop}
      />
    );
    await userEvent.setup().click(screen.getByRole('button', { name: /parar sessão/i }));
    expect(onStop).toHaveBeenCalled();
  });

  it('desabilita Stop quando loading=true', () => {
    render(
      <SessionControls
        activeSession={activeSession}
        onStart={jest.fn()}
        onStop={jest.fn()}
        loading
      />
    );
    expect(screen.getByRole('button', { name: /parar sessão/i })).toBeDisabled();
  });

  it('exibe formulário nova sessão quando não há sessão ativa', () => {
    render(
      <SessionControls
        activeSession={null}
        onStart={jest.fn()}
        onStop={jest.fn()}
      />
    );
    expect(screen.getByText(/nova sessão/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /paper/i })).toBeInTheDocument();
  });
});
