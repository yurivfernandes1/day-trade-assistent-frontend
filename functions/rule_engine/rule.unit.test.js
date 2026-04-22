/**
 * Testes unitários — US-C1: Rule Engine (Stoploss / Take-profit)
 * Valida todas as funções de cálculo de forma isolada, sem dependências externas.
 */
import {
  calcStoplossPrice,
  calcTakeProfitPrice,
  calcSlippage,
  shouldClosePosition,
  calcUnrealizedPnl,
  CLOSE_REASON,
} from '../../src/lib/ruleEngine.js';

describe('calcStoplossPrice — testes unitários', () => {
  it('calcula preço de SL corretamente para 2% de stop', () => {
    expect(calcStoplossPrice(100, 2)).toBeCloseTo(98);
  });

  it('calcula preço de SL corretamente para 5% de stop', () => {
    expect(calcStoplossPrice(200, 5)).toBeCloseTo(190);
  });

  it('calcula SL com decimais sem arredondamento incorreto', () => {
    expect(calcStoplossPrice(150.5, 1.5)).toBeCloseTo(150.5 * 0.985);
  });

  it('lança RangeError para entryPrice zero', () => {
    expect(() => calcStoplossPrice(0, 2)).toThrow(RangeError);
  });

  it('lança RangeError para entryPrice negativo', () => {
    expect(() => calcStoplossPrice(-10, 2)).toThrow(RangeError);
  });

  it('lança RangeError para stopPercent zero', () => {
    expect(() => calcStoplossPrice(100, 0)).toThrow(RangeError);
  });

  it('lança RangeError para stopPercent negativo', () => {
    expect(() => calcStoplossPrice(100, -1)).toThrow(RangeError);
  });
});

describe('calcTakeProfitPrice — testes unitários', () => {
  it('calcula preço de TP corretamente para 3% de alvo', () => {
    expect(calcTakeProfitPrice(100, 3)).toBeCloseTo(103);
  });

  it('calcula preço de TP para 10% de alvo', () => {
    expect(calcTakeProfitPrice(200, 10)).toBeCloseTo(220);
  });

  it('calcula TP com decimais sem arredondamento incorreto', () => {
    expect(calcTakeProfitPrice(150.5, 2.5)).toBeCloseTo(150.5 * 1.025);
  });

  it('lança RangeError para entryPrice zero', () => {
    expect(() => calcTakeProfitPrice(0, 3)).toThrow(RangeError);
  });

  it('lança RangeError para targetPercent negativo', () => {
    expect(() => calcTakeProfitPrice(100, -5)).toThrow(RangeError);
  });
});

describe('calcSlippage — testes unitários', () => {
  it('retorna 0 quando preços são iguais', () => {
    expect(calcSlippage(100, 100)).toBe(0);
  });

  it('calcula slippage positivo quando executado acima do esperado', () => {
    expect(calcSlippage(100, 101)).toBeCloseTo(1);
  });

  it('calcula slippage positivo quando executado abaixo do esperado', () => {
    expect(calcSlippage(100, 99)).toBeCloseTo(1);
  });

  it('retorna valor absoluto (sempre positivo)', () => {
    const slippage = calcSlippage(100, 95);
    expect(slippage).toBeGreaterThan(0);
    expect(slippage).toBeCloseTo(5);
  });

  it('lança RangeError para expectedPrice zero', () => {
    expect(() => calcSlippage(0, 100)).toThrow(RangeError);
  });
});

describe('shouldClosePosition — testes unitários', () => {
  const position = { entryPrice: 100, stopPercent: 2, targetPercent: 3 };
  // SL = 98, TP = 103

  it('retorna shouldClose=false quando preço está entre SL e TP', () => {
    const result = shouldClosePosition({ ...position, currentPrice: 101 });
    expect(result.shouldClose).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('retorna shouldClose=true com razão STOPLOSS quando preço cai até SL', () => {
    const result = shouldClosePosition({ ...position, currentPrice: 98 });
    expect(result.shouldClose).toBe(true);
    expect(result.reason).toBe(CLOSE_REASON.STOPLOSS);
  });

  it('retorna shouldClose=true com razão STOPLOSS quando preço cai abaixo do SL', () => {
    const result = shouldClosePosition({ ...position, currentPrice: 95 });
    expect(result.shouldClose).toBe(true);
    expect(result.reason).toBe(CLOSE_REASON.STOPLOSS);
  });

  it('retorna shouldClose=true com razão TAKEPROFIT quando preço sobe até TP', () => {
    const result = shouldClosePosition({ ...position, currentPrice: 103 });
    expect(result.shouldClose).toBe(true);
    expect(result.reason).toBe(CLOSE_REASON.TAKEPROFIT);
  });

  it('retorna shouldClose=true com razão TAKEPROFIT quando preço supera TP', () => {
    const result = shouldClosePosition({ ...position, currentPrice: 110 });
    expect(result.shouldClose).toBe(true);
    expect(result.reason).toBe(CLOSE_REASON.TAKEPROFIT);
  });

  it('trata SL e TP corretamente com entryPrice decimal', () => {
    // Entry 50.25, SL 2% = 49.245, TP 3% = 51.7575
    const pos = { entryPrice: 50.25, stopPercent: 2, targetPercent: 3 };
    expect(shouldClosePosition({ ...pos, currentPrice: 49 }).reason).toBe(CLOSE_REASON.STOPLOSS);
    expect(shouldClosePosition({ ...pos, currentPrice: 52 }).reason).toBe(CLOSE_REASON.TAKEPROFIT);
    expect(shouldClosePosition({ ...pos, currentPrice: 50.5 }).shouldClose).toBe(false);
  });

  it('é determinístico para a mesma entrada (sem aleatoriedade)', () => {
    const pos = { ...position, currentPrice: 97 };
    expect(shouldClosePosition(pos)).toEqual(shouldClosePosition(pos));
  });
});

describe('calcUnrealizedPnl — testes unitários', () => {
  it('calcula P&L positivo quando preço atual > entrada', () => {
    expect(calcUnrealizedPnl(100, 105, 10)).toBeCloseTo(50);
  });

  it('calcula P&L negativo quando preço atual < entrada', () => {
    expect(calcUnrealizedPnl(100, 95, 10)).toBeCloseTo(-50);
  });

  it('retorna zero quando preços são iguais', () => {
    expect(calcUnrealizedPnl(100, 100, 5)).toBe(0);
  });

  it('lança RangeError para qty zero', () => {
    expect(() => calcUnrealizedPnl(100, 105, 0)).toThrow(RangeError);
  });

  it('lança RangeError para qty negativo', () => {
    expect(() => calcUnrealizedPnl(100, 105, -1)).toThrow(RangeError);
  });
});
