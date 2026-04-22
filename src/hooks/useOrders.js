/**
 * US-C2 — Hook para gerenciar ordens de uma sessão
 * Integra broker (Paper sandbox) + persistência (Supabase orders) + P&L
 */
import { useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { sendOrder } from '../lib/broker';
import { persistOrder, listSessionOrders, ORDER_STATUS } from '../lib/orders';
import { deriveOpenPositions, calcPortfolioPnl } from '../lib/positions';

/**
 * @param {string|null} sessionId — ID da sessão ativa
 * @param {Record<string, number>} [currentPrices] — preços atuais por símbolo para cálculo de P&L
 */
export function useOrders(sessionId, currentPrices = {}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /** Posições abertas derivadas do histórico de ordens */
  const openPositions = useMemo(() => deriveOpenPositions(orders), [orders]);

  /** P&L não realizado do portfólio (null se preços não disponíveis) */
  const unrealizedPnl = useMemo(
    () => calcPortfolioPnl(openPositions, currentPrices),
    [openPositions, currentPrices]
  );

  const fetchOrders = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listSessionOrders(supabase, sessionId);
      setOrders(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  /**
   * Envia uma ordem ao broker sandbox e persiste no DB.
   *
   * @param {{ symbol: string, side: 'buy'|'sell', qty: number, price?: number,
   *           orderType?: string, apiKey: string, apiSecret: string,
   *           closeReason?: string|null, openOrderId?: string|null }} params
   * @returns {Promise<{ success: boolean, order?: object, brokerResponse?: object, error?: string }>}
   */
  const placeOrder = useCallback(
    async ({
      symbol,
      side,
      qty,
      price,
      orderType = 'market',
      apiKey,
      apiSecret,
      closeReason = null,
      openOrderId = null,
    }) => {
      if (!sessionId) return { success: false, error: 'Nenhuma sessão ativa.' };

      setLoading(true);
      setError(null);

      try {
        // 1. Enviar ao broker sandbox (Paper)
        const brokerResponse = await sendOrder({ symbol, side, qty, price, orderType, apiKey, apiSecret });

        // 2. Persistir no DB com referência à ordem de abertura e P&L realizado quando for fechamento
        const order = await persistOrder(supabase, {
          session_id: sessionId,
          symbol,
          side,
          qty,
          price: price ?? null,
          status: ORDER_STATUS.FILLED,
          broker_order_id: brokerResponse.id,
          close_reason: closeReason,
          open_order_id: openOrderId,
        });

        setOrders((prev) => [order, ...prev]);
        return { success: true, order, brokerResponse };
      } catch (err) {
        setError(err.message);
        return { success: false, error: err.message };
      } finally {
        setLoading(false);
      }
    },
    [sessionId]
  );

  return { orders, loading, error, placeOrder, fetchOrders, openPositions, unrealizedPnl };
}
