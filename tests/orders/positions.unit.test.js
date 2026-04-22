/**
 * Testes unitários — US-C2: positions.js (deriveOpenPositions, calcPortfolioPnl, calcRealizedPnl)
 */
import {
  deriveOpenPositions,
  calcPortfolioPnl,
  calcRealizedPnl,
} from '../../src/lib/positions.js';
import { ORDER_SIDE, ORDER_STATUS } from '../../src/lib/orders.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const BUY_AAPL = {
  id: 'order-buy-1',
  symbol: 'AAPL',
  side: ORDER_SIDE.BUY,
  qty: 10,
  price: 150,
  status: ORDER_STATUS.FILLED,
  close_reason: null,
  open_order_id: null,
  created_at: '2026-04-22T09:00:00Z',
  broker_order_id: 'broker-1',
};

const SELL_AAPL_SL = {
  id: 'order-sell-1',
  symbol: 'AAPL',
  side: ORDER_SIDE.SELL,
  qty: 10,
  price: 147,
  status: ORDER_STATUS.FILLED,
  close_reason: 'stoploss',
  open_order_id: 'order-buy-1',
  created_at: '2026-04-22T09:30:00Z',
  broker_order_id: 'broker-2',
};

const BUY_MGLU = {
  id: 'order-buy-2',
  symbol: 'MGLU3',
  side: ORDER_SIDE.BUY,
  qty: 100,
  price: 8.5,
  status: ORDER_STATUS.FILLED,
  close_reason: null,
  open_order_id: null,
  created_at: '2026-04-22T09:10:00Z',
  broker_order_id: 'broker-3',
};

// ─── deriveOpenPositions ──────────────────────────────────────────────────────
describe('deriveOpenPositions — testes unitários', () => {
  it('retorna lista vazia quando não há ordens', () => {
    expect(deriveOpenPositions([])).toEqual([]);
  });

  it('retorna posição aberta para BUY sem SELL correspondente', () => {
    const positions = deriveOpenPositions([BUY_AAPL]);
    expect(positions).toHaveLength(1);
    expect(positions[0].symbol).toBe('AAPL');
    expect(positions[0].qty).toBe(10);
    expect(positions[0].entryPrice).toBe(150);
  });

  it('não retorna posição fechada quando SELL com open_order_id existe', () => {
    const orders = [SELL_AAPL_SL, BUY_AAPL]; // mais recente primeiro
    const positions = deriveOpenPositions(orders);
    expect(positions).toHaveLength(0);
  });

  it('retorna apenas posições abertas em carteira mista', () => {
    // AAPL fechada, MGLU3 aberta
    const orders = [SELL_AAPL_SL, BUY_MGLU, BUY_AAPL];
    const positions = deriveOpenPositions(orders);
    expect(positions).toHaveLength(1);
    expect(positions[0].symbol).toBe('MGLU3');
  });

  it('retorna múltiplas posições abertas quando todas são BUY sem fechar', () => {
    const orders = [BUY_AAPL, BUY_MGLU];
    const positions = deriveOpenPositions(orders);
    expect(positions).toHaveLength(2);
  });

  it('inclui brokerOrderId na posição derivada', () => {
    const positions = deriveOpenPositions([BUY_AAPL]);
    expect(positions[0].brokerOrderId).toBe('broker-1');
  });

  it('ignora ordens SELL sem close_reason (ordens de abertura sell — short selling)', () => {
    const sellWithoutReason = {
      ...SELL_AAPL_SL,
      close_reason: null,
      open_order_id: null,
    };
    // BUY ainda deve aparecer como aberta (SELL sem close_reason não fecha a posição)
    const positions = deriveOpenPositions([sellWithoutReason, BUY_AAPL]);
    expect(positions).toHaveLength(1);
    expect(positions[0].symbol).toBe('AAPL');
  });
});

// ─── calcPortfolioPnl ─────────────────────────────────────────────────────────
describe('calcPortfolioPnl — testes unitários', () => {
  it('retorna 0 quando não há posições abertas', () => {
    expect(calcPortfolioPnl([], {})).toBe(0);
  });

  it('calcula P&L positivo para posição em lucro', () => {
    const positions = [{ symbol: 'AAPL', qty: 10, entryPrice: 150 }];
    const pnl = calcPortfolioPnl(positions, { AAPL: 155 });
    expect(pnl).toBeCloseTo(50); // (155-150)*10
  });

  it('calcula P&L negativo para posição em perda', () => {
    const positions = [{ symbol: 'AAPL', qty: 10, entryPrice: 150 }];
    const pnl = calcPortfolioPnl(positions, { AAPL: 147 });
    expect(pnl).toBeCloseTo(-30); // (147-150)*10
  });

  it('soma P&L de múltiplas posições', () => {
    const positions = [
      { symbol: 'AAPL', qty: 10, entryPrice: 150 },
      { symbol: 'MGLU3', qty: 100, entryPrice: 8.5 },
    ];
    const pnl = calcPortfolioPnl(positions, { AAPL: 153, MGLU3: 9.0 });
    expect(pnl).toBeCloseTo(30 + 50); // (153-150)*10 + (9-8.5)*100
  });

  it('retorna null quando preço de algum símbolo não está disponível', () => {
    const positions = [{ symbol: 'AAPL', qty: 10, entryPrice: 150 }];
    expect(calcPortfolioPnl(positions, {})).toBeNull();
  });

  it('retorna null quando entryPrice é zero', () => {
    const positions = [{ symbol: 'AAPL', qty: 10, entryPrice: 0 }];
    expect(calcPortfolioPnl(positions, { AAPL: 155 })).toBeNull();
  });
});

// ─── calcRealizedPnl ──────────────────────────────────────────────────────────
describe('calcRealizedPnl — testes unitários', () => {
  it('calcula P&L positivo ao fechar posição acima do preço de entrada', () => {
    expect(calcRealizedPnl(100, 105, 10)).toBeCloseTo(50);
  });

  it('calcula P&L negativo ao fechar posição por stoploss', () => {
    expect(calcRealizedPnl(100, 98, 10)).toBeCloseTo(-20);
  });

  it('retorna zero quando close e entry são iguais', () => {
    expect(calcRealizedPnl(100, 100, 5)).toBe(0);
  });

  it('lança RangeError para entryPrice zero', () => {
    expect(() => calcRealizedPnl(0, 105, 10)).toThrow(RangeError);
  });

  it('lança RangeError para closePrice zero', () => {
    expect(() => calcRealizedPnl(100, 0, 10)).toThrow(RangeError);
  });

  it('lança RangeError para qty zero', () => {
    expect(() => calcRealizedPnl(100, 105, 0)).toThrow(RangeError);
  });

  it('calcula P&L realizado de stoploss corretamente', () => {
    // Entrada 150, SL em 147, 10 ações
    expect(calcRealizedPnl(150, 147, 10)).toBeCloseTo(-30);
  });

  it('calcula P&L realizado de take-profit corretamente', () => {
    // Entrada 150, TP em 154.5 (3%), 10 ações
    expect(calcRealizedPnl(150, 154.5, 10)).toBeCloseTo(45);
  });
});
