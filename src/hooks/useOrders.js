/**
 * US-C2 — Hook para gerenciar ordens de uma sessão
 * Integra broker (Paper sandbox) + persistência (Supabase orders)
 */
import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { sendOrder } from '../lib/broker';
import { persistOrder, listSessionOrders, ORDER_STATUS } from '../lib/orders';

/**
 * @param {string|null} sessionId — ID da sessão ativa
 */
export function useOrders(sessionId) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
   *           closeReason?: string|null }} params
   * @returns {Promise<{ success: boolean, order?: object, error?: string }>}
   */
  const placeOrder = useCallback(
    async ({ symbol, side, qty, price, orderType = 'market', apiKey, apiSecret, closeReason = null }) => {
      if (!sessionId) return { success: false, error: 'Nenhuma sessão ativa.' };

      setLoading(true);
      setError(null);

      try {
        // 1. Enviar ao broker sandbox (Paper)
        const brokerResponse = await sendOrder({ symbol, side, qty, price, orderType, apiKey, apiSecret });

        // 2. Persistir no DB
        const order = await persistOrder(supabase, {
          session_id: sessionId,
          symbol,
          side,
          qty,
          price: price ?? null,
          status: ORDER_STATUS.FILLED,
          broker_order_id: brokerResponse.id,
          close_reason: closeReason,
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

  return { orders, loading, error, placeOrder, fetchOrders };
}
