/**
 * US-C2 — Rastreamento de posições abertas e P&L
 * Deriva posições do histórico de ordens da sessão.
 * Em Paper mode, cada BUY abre uma posição e cada SELL (com close_reason) fecha.
 */
import { ORDER_SIDE, ORDER_STATUS } from './orders.js';
import { calcUnrealizedPnl } from './ruleEngine.js';

/**
 * Deriva as posições abertas a partir da lista de ordens da sessão.
 * Uma posição é aberta por um BUY FILLED e fechada por um SELL FILLED com close_reason.
 *
 * @param {object[]} orders - Lista de ordens da sessão (mais recentes primeiro)
 * @returns {object[]} posições abertas
 */
export function deriveOpenPositions(orders) {
  const filledBuys = orders.filter(
    (o) => o.side === ORDER_SIDE.BUY && o.status === ORDER_STATUS.FILLED
  );
  const closedBuyIds = new Set(
    orders
      .filter((o) => o.side === ORDER_SIDE.SELL && o.close_reason != null)
      .map((o) => o.open_order_id)
      .filter(Boolean)
  );

  return filledBuys
    .filter((o) => !closedBuyIds.has(o.id))
    .map((o) => ({
      id: o.id,
      symbol: o.symbol,
      qty: o.qty,
      entryPrice: o.price ?? 0,
      openedAt: o.created_at,
      brokerOrderId: o.broker_order_id,
    }));
}

/**
 * Calcula o P&L não realizado total das posições abertas.
 * Retorna null quando não há preço de entrada definido.
 *
 * @param {object[]} openPositions - Array retornado por deriveOpenPositions()
 * @param {Record<string, number>} currentPrices - Mapa { symbol: currentPrice }
 * @returns {number|null}
 */
export function calcPortfolioPnl(openPositions, currentPrices) {
  if (!openPositions.length) return 0;

  let total = 0;
  for (const pos of openPositions) {
    const current = currentPrices[pos.symbol];
    if (current == null || pos.entryPrice <= 0) return null;
    total += calcUnrealizedPnl(pos.entryPrice, current, pos.qty);
  }
  return total;
}

/**
 * Calcula o P&L realizado de uma ordem de fechamento.
 * pnl = (closePrice - entryPrice) * qty
 *
 * @param {number} entryPrice
 * @param {number} closePrice
 * @param {number} qty
 * @returns {number}
 */
export function calcRealizedPnl(entryPrice, closePrice, qty) {
  if (entryPrice <= 0) throw new RangeError('entryPrice deve ser maior que zero');
  if (closePrice <= 0) throw new RangeError('closePrice deve ser maior que zero');
  if (qty <= 0) throw new RangeError('qty deve ser maior que zero');
  return (closePrice - entryPrice) * qty;
}
