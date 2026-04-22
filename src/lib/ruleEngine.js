/**
 * US-C1 — Rule Engine: Stoploss / Take-profit (hot path determinístico)
 * Este módulo NÃO chama o LLM. Aplica regras de forma síncrona e determinística.
 */

export const CLOSE_REASON = Object.freeze({
  STOPLOSS: 'stoploss',
  TAKEPROFIT: 'takeprofit',
});

/**
 * Calcula o preço de stoploss para uma posição de compra (long).
 * SL = entryPrice * (1 - stopPercent / 100)
 *
 * @param {number} entryPrice - Preço de entrada da posição
 * @param {number} stopPercent - Percentual de stop (ex: 2 = 2%)
 * @returns {number}
 */
export function calcStoplossPrice(entryPrice, stopPercent) {
  if (entryPrice <= 0) throw new RangeError('entryPrice deve ser maior que zero');
  if (stopPercent <= 0) throw new RangeError('stopPercent deve ser maior que zero');
  return entryPrice * (1 - stopPercent / 100);
}

/**
 * Calcula o preço de take-profit para uma posição de compra (long).
 * TP = entryPrice * (1 + targetPercent / 100)
 *
 * @param {number} entryPrice - Preço de entrada da posição
 * @param {number} targetPercent - Percentual alvo (ex: 3 = 3%)
 * @returns {number}
 */
export function calcTakeProfitPrice(entryPrice, targetPercent) {
  if (entryPrice <= 0) throw new RangeError('entryPrice deve ser maior que zero');
  if (targetPercent <= 0) throw new RangeError('targetPercent deve ser maior que zero');
  return entryPrice * (1 + targetPercent / 100);
}

/**
 * Calcula o slippage em porcentagem entre o preço esperado e o executado.
 * slippage = |executedPrice - expectedPrice| / expectedPrice * 100
 *
 * @param {number} expectedPrice
 * @param {number} executedPrice
 * @returns {number} slippage em %
 */
export function calcSlippage(expectedPrice, executedPrice) {
  if (expectedPrice <= 0) throw new RangeError('expectedPrice deve ser maior que zero');
  return Math.abs((executedPrice - expectedPrice) / expectedPrice) * 100;
}

/**
 * Verifica se uma posição deve ser fechada com base no preço atual,
 * aplicando regras de stoploss e take-profit de forma determinística.
 *
 * @param {{ entryPrice: number, currentPrice: number,
 *           stopPercent: number, targetPercent: number }} position
 * @returns {{ shouldClose: boolean, reason: 'stoploss'|'takeprofit'|null }}
 */
export function shouldClosePosition({ entryPrice, currentPrice, stopPercent, targetPercent }) {
  const sl = calcStoplossPrice(entryPrice, stopPercent);
  const tp = calcTakeProfitPrice(entryPrice, targetPercent);

  if (currentPrice <= sl) {
    return { shouldClose: true, reason: CLOSE_REASON.STOPLOSS };
  }
  if (currentPrice >= tp) {
    return { shouldClose: true, reason: CLOSE_REASON.TAKEPROFIT };
  }
  return { shouldClose: false, reason: null };
}

/**
 * Calcula o P&L não realizado de uma posição.
 * pnl = (currentPrice - entryPrice) * qty
 *
 * @param {number} entryPrice
 * @param {number} currentPrice
 * @param {number} qty
 * @returns {number}
 */
export function calcUnrealizedPnl(entryPrice, currentPrice, qty) {
  if (qty <= 0) throw new RangeError('qty deve ser maior que zero');
  return (currentPrice - entryPrice) * qty;
}
