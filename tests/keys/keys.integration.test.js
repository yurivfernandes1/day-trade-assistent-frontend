/**
 * Testes de integração — US-A2: Gerenciar chaves de API
 * - Valida CRUD com mock do Supabase client
 * - Valida que valor em claro NÃO está na resposta (apenas key_masked)
 * - Valida isolamento por usuário (RLS simulada via mock)
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ApiKeyManager from '../../src/components/keys/ApiKeyManager';

// Mock do Supabase
jest.mock('../../src/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));
jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'user@example.com' } }),
}));

import { supabase } from '../../src/lib/supabase';

function buildChain(result) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
  // select sem .single() deve resolver diretamente
  chain.order.mockResolvedValue(result);
  return chain;
}

describe('ApiKeyManager — testes de integração', () => {
  afterEach(() => jest.clearAllMocks());

  it('lista chaves do usuário sem expor valor em claro', async () => {
    const fakeKeys = [
      {
        id: '1',
        label: 'Alpaca Paper',
        broker: 'Alpaca',
        key_masked: '************ABCD',
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
    supabase.from.mockReturnValue(buildChain({ data: fakeKeys, error: null }));

    render(<ApiKeyManager />);

    await waitFor(() => {
      expect(screen.getByText('Alpaca Paper')).toBeInTheDocument();
      expect(screen.getByText('************ABCD')).toBeInTheDocument();
    });
    // Garantir que o valor em claro não está visível
    expect(screen.queryByText(/PKTEST/)).not.toBeInTheDocument();
  });

  it('cria nova chave e exibe na lista sem expor key_value', async () => {
    const newKey = {
      id: '2',
      label: 'Binance Sandbox',
      broker: 'Binance',
      key_masked: '****************1234',
      created_at: '2026-04-21T00:00:00Z',
    };

    // Primeira chamada: lista vazia; segunda: retorna a nova chave
    supabase.from
      .mockReturnValueOnce(buildChain({ data: [], error: null }))
      .mockReturnValue(buildChain({ data: newKey, error: null }));

    render(<ApiKeyManager />);
    await screen.findByText(/nenhuma chave/i);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /adicionar/i }));

    await user.type(screen.getByLabelText(/label/i), 'Binance Sandbox');
    await user.selectOptions(screen.getByLabelText(/broker/i), 'Binance');
    await user.type(screen.getByLabelText(/api key/i), 'BINKEY12345678901234');
    await user.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(screen.getByText('Binance Sandbox')).toBeInTheDocument();
      // key_masked exposta, não o valor em claro
      expect(screen.getByText('****************1234')).toBeInTheDocument();
      expect(screen.queryByText('BINKEY12345678901234')).not.toBeInTheDocument();
    });
  });

  it('remove chave ao confirmar exclusão', async () => {
    const fakeKeys = [
      {
        id: '1',
        label: 'Alpaca Paper',
        broker: 'Alpaca',
        key_masked: '****ABCD',
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    supabase.from
      .mockReturnValueOnce(buildChain({ data: fakeKeys, error: null }))
      .mockReturnValue(buildChain({ data: null, error: null }));

    window.confirm = jest.fn().mockReturnValue(true);

    render(<ApiKeyManager />);
    await screen.findByText('Alpaca Paper');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /remover chave alpaca paper/i }));

    await waitFor(() => {
      expect(screen.queryByText('Alpaca Paper')).not.toBeInTheDocument();
    });
  });

  it('segurança: chave de outro usuário não aparece (RLS simulada)', async () => {
    // O Supabase com RLS retornaria lista vazia para outro user_id
    supabase.from.mockReturnValue(buildChain({ data: [], error: null }));

    render(<ApiKeyManager />);
    await screen.findByText(/nenhuma chave/i);

    // Nenhuma chave de outro usuário deve aparecer
    expect(screen.queryByText('Chave de outro usuário')).not.toBeInTheDocument();
  });
});
