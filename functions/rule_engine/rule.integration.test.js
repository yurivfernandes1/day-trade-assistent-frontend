/**
 * @jest-environment node
 */

/**
 * Testes de integração — US-C1: Rule Engine com broker mock (msw) + Supabase mock
 * Valida o hot path determinístico:
 *   1. shouldClosePosition detecta stoploss/takeprofit
 *   2. sendOrder envia payload correto ao broker sandbox (interceptado por msw)
 *   3. persistOrder grava o evento de execução no DB (mock Supabase)
 */
import { jest } from '@jest/globals';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// ─── Broker mock server ───────────────────────────────────────────────────────
const SANDBOX_URL = 'https://paper-api.alpaca.markets';

const FILLED_ORDER = {
  id: 'broker-order-001',
  status: 'filled',
  symbol: 'AAPL',
  qty: '10',
  side: 'sell',
  filled_avg_price: '97.50',
};

const server = setupServer(
  http.post(`${SANDBOX_URL}/v2/orders`, () => HttpResponse.json(FILLED_ORDER, { status: 200 }))
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  jest.clearAllMocks();
});
afterAll(() => server.close());

// ─── Supabase mock ─────────────────────────────────────────────────────────────
const mockSingle = jest.fn();
const mockInsertChain = {
  insert: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  single: mockSingle,
};

await jest.unstable_mockModule('../../src/lib/supabase', () => ({
  supabase: { from: jest.fn(() => mockInsertChain) },
}));

// ─── Importações dinâmicas após os mocks ─────────────────────────────────────
const { shouldClosePosition, CLOSE_REASON } = await import('../../src/lib/ruleEngine.js');
const { sendOrder } = await import('../../src/lib/broker.js');
const { persistOrder, ORDER_STATUS } = await import('../../src/lib/orders.js');
const { supabase } = await import('../../src/lib/supabase.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────
const FAKE_CREDS = { apiKey: 'test-key', apiSecret: 'test-secret' };

// ─── Testes ───────────────────────────────────────────────────────────────────
describe('Rule Engine — integração (hot path stoploss)', () => {
  it('detecta stoploss e envia ordem de venda ao broker sandbox', async () => {
    // Arrange: posição com entry 100, SL 2% → SL price = 98
    const position = { entryPrice: 100, stopPercent: 2, targetPercent: 3 };
    const currentPrice = 97.5; // abaixo do SL

    // Act: verifica se deve fechar
    const { shouldClose, reason } = shouldClosePosition({ ...position, currentPrice });

    expect(shouldClose).toBe(true);
    expect(reason).toBe(CLOSE_REASON.STOPLOSS);

    // Act: envia ordem de fechamento (sell)
    const brokerResponse = await sendOrder({
      symbol: 'AAPL',
      side: 'sell',
      qty: 10,
      ...FAKE_CREDS,
    });

    expect(brokerResponse.id).toBe(FILLED_ORDER.id);
    expect(brokerResponse.status).toBe('filled');
  });

  it('persiste evento de execução de stoploss no DB com dados corretos', async () => {
    const PERSISTED_ORDER = {
      id: 'db-order-001',
      session_id: 'session-123',
      symbol: 'AAPL',
      side: 'sell',
      qty: 10,
      status: ORDER_STATUS.FILLED,
      broker_order_id: FILLED_ORDER.id,
      close_reason: CLOSE_REASON.STOPLOSS,
    };

    mockSingle.mockResolvedValueOnce({ data: PERSISTED_ORDER, error: null });

    const order = await persistOrder(supabase, {
      session_id: 'session-123',
      symbol: 'AAPL',
      side: 'sell',
      qty: 10,
      status: ORDER_STATUS.FILLED,
      broker_order_id: FILLED_ORDER.id,
      close_reason: CLOSE_REASON.STOPLOSS,
    });

    expect(order.close_reason).toBe(CLOSE_REASON.STOPLOSS);
    expect(order.broker_order_id).toBe(FILLED_ORDER.id);
    expect(order.status).toBe(ORDER_STATUS.FILLED);
  });

  it('executa hot path completo: stoploss → broker → persistência', async () => {
    // Arrange
    const PERSISTED_ORDER = {
      id: 'db-order-002',
      session_id: 'session-456',
      symbol: 'PETR4',
      side: 'sell',
      qty: 5,
      status: ORDER_STATUS.FILLED,
      broker_order_id: FILLED_ORDER.id,
      close_reason: CLOSE_REASON.STOPLOSS,
    };
    mockSingle.mockResolvedValueOnce({ data: PERSISTED_ORDER, error: null });

    server.use(
      http.post(`${SANDBOX_URL}/v2/orders`, () =>
        HttpResponse.json({ ...FILLED_ORDER, symbol: 'PETR4', qty: '5' }, { status: 200 })
      )
    );

    // 1. Regra dispara
    const { shouldClose, reason } = shouldClosePosition({
      entryPrice: 40,
      currentPrice: 38.5, // -3.75% → abaixo do SL 2%
      stopPercent: 2,
      targetPercent: 5,
    });
    expect(shouldClose).toBe(true);
    expect(reason).toBe(CLOSE_REASON.STOPLOSS);

    // 2. Envia ordem
    const brokerResponse = await sendOrder({ symbol: 'PETR4', side: 'sell', qty: 5, ...FAKE_CREDS });
    expect(brokerResponse.symbol).toBe('PETR4');

    // 3. Persiste evento
    const order = await persistOrder(supabase, {
      session_id: 'session-456',
      symbol: 'PETR4',
      side: 'sell',
      qty: 5,
      status: ORDER_STATUS.FILLED,
      broker_order_id: brokerResponse.id,
      close_reason: reason,
    });

    expect(order.close_reason).toBe(CLOSE_REASON.STOPLOSS);
    expect(supabase.from).toHaveBeenCalledWith('orders');
  });
});

describe('Rule Engine — integração (hot path take-profit)', () => {
  it('detecta take-profit e envia ordem de venda ao broker sandbox', async () => {
    const position = { entryPrice: 100, stopPercent: 2, targetPercent: 3 };
    const currentPrice = 104; // acima do TP = 103

    const { shouldClose, reason } = shouldClosePosition({ ...position, currentPrice });

    expect(shouldClose).toBe(true);
    expect(reason).toBe(CLOSE_REASON.TAKEPROFIT);

    const brokerResponse = await sendOrder({
      symbol: 'AAPL',
      side: 'sell',
      qty: 10,
      ...FAKE_CREDS,
    });

    expect(brokerResponse.status).toBe('filled');
  });

  it('executa hot path completo: take-profit → broker → persistência', async () => {
    const PERSISTED_ORDER = {
      id: 'db-order-003',
      session_id: 'session-789',
      symbol: 'AAPL',
      side: 'sell',
      qty: 10,
      status: ORDER_STATUS.FILLED,
      broker_order_id: FILLED_ORDER.id,
      close_reason: CLOSE_REASON.TAKEPROFIT,
    };
    mockSingle.mockResolvedValueOnce({ data: PERSISTED_ORDER, error: null });

    const { shouldClose, reason } = shouldClosePosition({
      entryPrice: 100,
      currentPrice: 106,
      stopPercent: 2,
      targetPercent: 3,
    });
    expect(shouldClose).toBe(true);
    expect(reason).toBe(CLOSE_REASON.TAKEPROFIT);

    const brokerResponse = await sendOrder({ symbol: 'AAPL', side: 'sell', qty: 10, ...FAKE_CREDS });

    const order = await persistOrder(supabase, {
      session_id: 'session-789',
      symbol: 'AAPL',
      side: 'sell',
      qty: 10,
      status: ORDER_STATUS.FILLED,
      broker_order_id: brokerResponse.id,
      close_reason: reason,
    });

    expect(order.close_reason).toBe(CLOSE_REASON.TAKEPROFIT);
    expect(order.status).toBe(ORDER_STATUS.FILLED);
  });
});

describe('Rule Engine — integração (cenários de erro)', () => {
  it('não chama broker quando posição não deve ser fechada', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    const { shouldClose } = shouldClosePosition({
      entryPrice: 100,
      currentPrice: 101, // entre SL 98 e TP 103
      stopPercent: 2,
      targetPercent: 3,
    });

    expect(shouldClose).toBe(false);
    // fetch não deve ser chamado
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('lança BrokerError quando broker retorna erro 422', async () => {
    server.use(
      http.post(`${SANDBOX_URL}/v2/orders`, () =>
        HttpResponse.json({ message: 'insufficient qty' }, { status: 422 })
      )
    );

    const { BrokerError } = await import('../../src/lib/broker.js');

    await expect(
      sendOrder({ symbol: 'AAPL', side: 'sell', qty: 10, ...FAKE_CREDS })
    ).rejects.toThrow(BrokerError);
  });

  it('propaga erro do Supabase ao persistir ordem', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'DB constraint violation' } });

    await expect(
      persistOrder(supabase, {
        session_id: 'session-err',
        symbol: 'AAPL',
        side: 'sell',
        qty: 10,
        status: ORDER_STATUS.FILLED,
        broker_order_id: 'broker-x',
        close_reason: CLOSE_REASON.STOPLOSS,
      })
    ).rejects.toThrow('DB constraint violation');
  });
});

describe('Rule Engine — contract tests (payload do broker)', () => {
  it('envia payload com symbol, qty, side e time_in_force ao broker', async () => {
    let capturedBody;
    server.use(
      http.post(`${SANDBOX_URL}/v2/orders`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(FILLED_ORDER, { status: 200 });
      })
    );

    await sendOrder({ symbol: 'MGLU3', side: 'buy', qty: 100, ...FAKE_CREDS });

    expect(capturedBody).toMatchObject({
      symbol: 'MGLU3',
      qty: '100',
      side: 'buy',
      type: 'market',
      time_in_force: 'day',
    });
  });

  it('envia headers de autenticação corretos ao broker', async () => {
    let capturedHeaders;
    server.use(
      http.post(`${SANDBOX_URL}/v2/orders`, ({ request }) => {
        capturedHeaders = Object.fromEntries(request.headers.entries());
        return HttpResponse.json(FILLED_ORDER, { status: 200 });
      })
    );

    await sendOrder({ symbol: 'AAPL', side: 'sell', qty: 5, apiKey: 'mykey', apiSecret: 'mysecret' });

    expect(capturedHeaders['apca-api-key-id']).toBe('mykey');
    expect(capturedHeaders['apca-api-secret-key']).toBe('mysecret');
  });

  it('inclui limit_price no payload quando orderType é limit', async () => {
    let capturedBody;
    server.use(
      http.post(`${SANDBOX_URL}/v2/orders`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(FILLED_ORDER, { status: 200 });
      })
    );

    await sendOrder({ symbol: 'AAPL', side: 'sell', qty: 5, price: 99.5, orderType: 'limit', ...FAKE_CREDS });

    expect(capturedBody.limit_price).toBe('99.5');
    expect(capturedBody.type).toBe('limit');
  });
});
