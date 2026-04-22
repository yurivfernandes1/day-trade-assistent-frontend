/**
 * @jest-environment node
 */

/**
 * Testes de integração — US-C2: Enviar ordem (Paper) via API de broker
 * Valida o fluxo completo:
 *   broker sandbox (msw) → persistência (Supabase mock) → atualização de estado
 * Mocks: msw para HTTP do broker, jest.unstable_mockModule para Supabase
 */
import { jest } from '@jest/globals';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// ─── Broker mock server ───────────────────────────────────────────────────────
const SANDBOX_URL = 'https://paper-api.alpaca.markets';

const BROKER_FILLED = {
  id: 'broker-fill-001',
  client_order_id: 'client-001',
  status: 'filled',
  symbol: 'AAPL',
  qty: '5',
  side: 'buy',
  type: 'market',
  filled_avg_price: '150.00',
  filled_at: '2026-04-22T10:00:00Z',
};

const server = setupServer(
  http.post(`${SANDBOX_URL}/v2/orders`, () => HttpResponse.json(BROKER_FILLED, { status: 200 }))
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  jest.clearAllMocks();
});
afterAll(() => server.close());

// ─── Supabase mock ─────────────────────────────────────────────────────────────
const mockSingle = jest.fn();
const mockOrderChain = {
  insert: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  single: mockSingle,
};
// listSessionOrders resolve via .order() sem .single()
mockOrderChain.order.mockImplementation(() => ({
  ...mockOrderChain,
  then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
}));

await jest.unstable_mockModule('../../src/lib/supabase', () => ({
  supabase: { from: jest.fn(() => mockOrderChain) },
}));

// ─── Importações dinâmicas após os mocks ─────────────────────────────────────
const { sendOrder, BrokerError } = await import('../../src/lib/broker.js');
const { persistOrder, updateOrderStatus, listSessionOrders, ORDER_STATUS, ORDER_SIDE } =
  await import('../../src/lib/orders.js');
const { supabase } = await import('../../src/lib/supabase.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────
const FAKE_CREDS = { apiKey: 'pk-test', apiSecret: 'sk-test' };

// ─── Testes: sendOrder ────────────────────────────────────────────────────────
describe('sendOrder — integração com broker sandbox', () => {
  it('retorna resposta do broker ao enviar ordem de compra', async () => {
    const result = await sendOrder({ symbol: 'AAPL', side: 'buy', qty: 5, ...FAKE_CREDS });

    expect(result.id).toBe(BROKER_FILLED.id);
    expect(result.status).toBe('filled');
    expect(result.symbol).toBe('AAPL');
  });

  it('envia ordem de venda corretamente', async () => {
    server.use(
      http.post(`${SANDBOX_URL}/v2/orders`, () =>
        HttpResponse.json({ ...BROKER_FILLED, side: 'sell' }, { status: 200 })
      )
    );

    const result = await sendOrder({ symbol: 'AAPL', side: 'sell', qty: 5, ...FAKE_CREDS });
    expect(result.side).toBe('sell');
  });

  it('lança BrokerError para ordem rejeitada (403)', async () => {
    server.use(
      http.post(`${SANDBOX_URL}/v2/orders`, () =>
        HttpResponse.json({ message: 'forbidden' }, { status: 403 })
      )
    );

    await expect(sendOrder({ symbol: 'AAPL', side: 'buy', qty: 5, ...FAKE_CREDS })).rejects.toBeInstanceOf(
      BrokerError
    );
  });

  it('lança BrokerError para saldo insuficiente (422)', async () => {
    server.use(
      http.post(`${SANDBOX_URL}/v2/orders`, () =>
        HttpResponse.json({ message: 'insufficient buying power' }, { status: 422 })
      )
    );

    await expect(
      sendOrder({ symbol: 'AAPL', side: 'buy', qty: 9999, ...FAKE_CREDS })
    ).rejects.toThrow('insufficient buying power');
  });

  it('lança BrokerError com código de status correto', async () => {
    server.use(
      http.post(`${SANDBOX_URL}/v2/orders`, () =>
        HttpResponse.json({ message: 'unauthorized' }, { status: 401 })
      )
    );

    let err;
    try {
      await sendOrder({ symbol: 'AAPL', side: 'buy', qty: 5, ...FAKE_CREDS });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BrokerError);
    expect(err.status).toBe(401);
  });

  it('lança BrokerError ao omitir parâmetros obrigatórios', async () => {
    await expect(sendOrder({ symbol: 'AAPL', side: 'buy', qty: 5 })).rejects.toBeInstanceOf(BrokerError);
  });
});

// ─── Testes: persistOrder ────────────────────────────────────────────────────
describe('persistOrder — integração com Supabase mock', () => {
  const ORDER_PAYLOAD = {
    session_id: 'session-abc',
    symbol: 'AAPL',
    side: ORDER_SIDE.BUY,
    qty: 5,
    price: 150,
    status: ORDER_STATUS.FILLED,
    broker_order_id: BROKER_FILLED.id,
    close_reason: null,
  };

  it('persiste ordem e retorna dados com id do DB', async () => {
    const DB_ORDER = { id: 'db-001', ...ORDER_PAYLOAD };
    mockSingle.mockResolvedValueOnce({ data: DB_ORDER, error: null });

    const result = await persistOrder(supabase, ORDER_PAYLOAD);

    expect(result.id).toBe('db-001');
    expect(result.broker_order_id).toBe(BROKER_FILLED.id);
    expect(result.status).toBe(ORDER_STATUS.FILLED);
  });

  it('chama supabase.from("orders") corretamente', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'db-002', ...ORDER_PAYLOAD }, error: null });

    await persistOrder(supabase, ORDER_PAYLOAD);

    expect(supabase.from).toHaveBeenCalledWith('orders');
    expect(mockOrderChain.insert).toHaveBeenCalledWith([ORDER_PAYLOAD]);
  });

  it('propaga erro do Supabase', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'unique violation' } });

    await expect(persistOrder(supabase, ORDER_PAYLOAD)).rejects.toThrow('unique violation');
  });
});

// ─── Testes: updateOrderStatus ───────────────────────────────────────────────
describe('updateOrderStatus — integração com Supabase mock', () => {
  it('atualiza status da ordem para CANCELLED', async () => {
    mockOrderChain.then = (resolve) =>
      Promise.resolve({ data: null, error: null }).then(resolve);

    await expect(updateOrderStatus(supabase, 'db-001', ORDER_STATUS.CANCELLED)).resolves.not.toThrow();
    expect(supabase.from).toHaveBeenCalledWith('orders');
  });

  it('propaga erro do Supabase ao atualizar status', async () => {
    mockOrderChain.then = (resolve, reject) =>
      Promise.resolve({ data: null, error: { message: 'update failed' } }).then(resolve, reject);

    await expect(updateOrderStatus(supabase, 'db-err', ORDER_STATUS.CANCELLED)).rejects.toThrow(
      'update failed'
    );
  });
});

// ─── Testes: fluxo completo Start→Signal→Order→Confirm ────────────────────────
describe('Fluxo completo Paper: Start → Signal → Order → Confirm', () => {
  it('executa fluxo de compra: sinal → broker → persistência → ordem filled', async () => {
    const SESSION_ID = 'session-paper-001';
    const DB_ORDER = {
      id: 'db-flow-001',
      session_id: SESSION_ID,
      symbol: 'AAPL',
      side: ORDER_SIDE.BUY,
      qty: 5,
      price: null,
      status: ORDER_STATUS.FILLED,
      broker_order_id: BROKER_FILLED.id,
      close_reason: null,
    };
    mockSingle.mockResolvedValueOnce({ data: DB_ORDER, error: null });

    // 1. Sinal de compra recebido (ex.: LLM suggestion ou entrada manual)
    const signal = { symbol: 'AAPL', side: ORDER_SIDE.BUY, qty: 5 };

    // 2. Envia ao broker sandbox
    const brokerResponse = await sendOrder({ ...signal, ...FAKE_CREDS });
    expect(brokerResponse.status).toBe('filled');

    // 3. Confirma e persiste
    const order = await persistOrder(supabase, {
      session_id: SESSION_ID,
      symbol: signal.symbol,
      side: signal.side,
      qty: signal.qty,
      price: null,
      status: ORDER_STATUS.FILLED,
      broker_order_id: brokerResponse.id,
      close_reason: null,
    });

    expect(order.id).toBe('db-flow-001');
    expect(order.session_id).toBe(SESSION_ID);
    expect(order.status).toBe(ORDER_STATUS.FILLED);
    expect(order.broker_order_id).toBe(BROKER_FILLED.id);
  });

  it('fluxo de fechamento por stoploss: sinal → broker → persistência com close_reason', async () => {
    const SESSION_ID = 'session-paper-002';
    const CLOSE_REASON = 'stoploss';
    const DB_ORDER = {
      id: 'db-flow-002',
      session_id: SESSION_ID,
      symbol: 'AAPL',
      side: ORDER_SIDE.SELL,
      qty: 5,
      price: null,
      status: ORDER_STATUS.FILLED,
      broker_order_id: BROKER_FILLED.id,
      close_reason: CLOSE_REASON,
    };
    mockSingle.mockResolvedValueOnce({ data: DB_ORDER, error: null });

    server.use(
      http.post(`${SANDBOX_URL}/v2/orders`, () =>
        HttpResponse.json({ ...BROKER_FILLED, side: 'sell' }, { status: 200 })
      )
    );

    const brokerResponse = await sendOrder({ symbol: 'AAPL', side: 'sell', qty: 5, ...FAKE_CREDS });

    const order = await persistOrder(supabase, {
      session_id: SESSION_ID,
      symbol: 'AAPL',
      side: ORDER_SIDE.SELL,
      qty: 5,
      price: null,
      status: ORDER_STATUS.FILLED,
      broker_order_id: brokerResponse.id,
      close_reason: CLOSE_REASON,
    });

    expect(order.close_reason).toBe('stoploss');
    expect(order.side).toBe(ORDER_SIDE.SELL);
  });

  it('não persiste quando broker retorna erro (ordem não deve ficar órfã)', async () => {
    server.use(
      http.post(`${SANDBOX_URL}/v2/orders`, () =>
        HttpResponse.json({ message: 'market closed' }, { status: 422 })
      )
    );

    await expect(
      sendOrder({ symbol: 'AAPL', side: 'buy', qty: 5, ...FAKE_CREDS })
    ).rejects.toBeInstanceOf(BrokerError);

    // persistOrder NÃO deve ser chamado após falha do broker
    expect(mockOrderChain.insert).not.toHaveBeenCalled();
  });
});
