/**
 * US-C2 — Persistência e listagem de ordens via Supabase
 */

export const ORDER_STATUS = Object.freeze({
  PENDING: 'pending',
  FILLED: 'filled',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
});

export const ORDER_SIDE = Object.freeze({
  BUY: 'buy',
  SELL: 'sell',
});

/**
 * Persiste uma nova ordem no banco de dados.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ session_id: string, symbol: string, side: string, qty: number,
 *           price?: number, status: string, broker_order_id?: string, close_reason?: string }} orderData
 * @returns {Promise<object>}
 */
export async function persistOrder(supabase, orderData) {
  const { data, error } = await supabase
    .from('orders')
    .insert([orderData])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Atualiza o status de uma ordem existente.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} orderId
 * @param {string} status
 */
export async function updateOrderStatus(supabase, orderId, status) {
  const { error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId);

  if (error) throw new Error(error.message);
}

/**
 * Lista todas as ordens de uma sessão, ordenadas da mais recente.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} sessionId
 * @returns {Promise<object[]>}
 */
export async function listSessionOrders(supabase, sessionId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}
