/**
 * US-G1 — Logs de auditoria imutáveis (append-only)
 *
 * Cada ação relevante (criação de ordem, mudança de status, início/parada
 * de sessão, sugestão LLM) gera um registro na tabela `audit_events`.
 *
 * Os registros são INSERIDOS mas NUNCA alterados (append-only por design).
 * O RLS da tabela deve proibir UPDATE e DELETE para garantir imutabilidade.
 */

export const AUDIT_EVENT_TYPE = Object.freeze({
  ORDER_CREATED: 'order.created',
  ORDER_STATUS_CHANGED: 'order.status_changed',
  SESSION_STARTED: 'session.started',
  SESSION_STOPPED: 'session.stopped',
  LLM_SUGGESTION_RECEIVED: 'llm.suggestion_received',
  LLM_SUGGESTION_ERROR: 'llm.suggestion_error',
  API_KEY_ADDED: 'api_key.added',
  API_KEY_REMOVED: 'api_key.removed',
});

/**
 * Persiste um evento de auditoria na tabela `audit_events`.
 * Append-only: esta função apenas faz INSERT, nunca UPDATE ou DELETE.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ event_type: string, user_id: string, session_id?: string,
 *           entity_id?: string, entity_type?: string, payload?: object }} eventData
 * @returns {Promise<object>} registro inserido
 */
export async function appendAuditEvent(supabase, eventData) {
  const record = {
    event_type: eventData.event_type,
    user_id: eventData.user_id,
    session_id: eventData.session_id ?? null,
    entity_id: eventData.entity_id ?? null,
    entity_type: eventData.entity_type ?? null,
    payload: eventData.payload ?? {},
    occurred_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('audit_events')
    .insert([record])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Lista eventos de auditoria filtráveis por usuário e/ou sessão.
 * Ordem: mais recente primeiro.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ userId: string, sessionId?: string, limit?: number }} filters
 * @returns {Promise<object[]>}
 */
export async function listAuditEvents(supabase, { userId, sessionId, limit = 100 } = {}) {
  let query = supabase
    .from('audit_events')
    .select('*')
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (sessionId) {
    query = query.eq('session_id', sessionId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Cria uma ordem e registra o evento de auditoria correspondente.
 * Garante que cada criação de ordem tenha trilha auditável.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {import('./orders.js').persistOrder extends Function ? Parameters<import('./orders.js').persistOrder>[1] : object} orderData
 * @param {string} userId
 * @returns {Promise<object>} ordem persistida
 */
export async function persistOrderWithAudit(supabase, orderData, userId) {
  const { persistOrder } = await import('./orders.js');
  const order = await persistOrder(supabase, orderData);

  await appendAuditEvent(supabase, {
    event_type: AUDIT_EVENT_TYPE.ORDER_CREATED,
    user_id: userId,
    session_id: orderData.session_id,
    entity_id: order.id,
    entity_type: 'order',
    payload: {
      symbol: orderData.symbol,
      side: orderData.side,
      qty: orderData.qty,
      price: orderData.price ?? null,
      status: orderData.status,
    },
  });

  return order;
}

/**
 * Atualiza o status de uma ordem e registra o evento de auditoria.
 * Cada mudança de status gera um NOVO registro (nunca sobrescreve o anterior).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} orderId
 * @param {string} newStatus
 * @param {{ userId: string, sessionId?: string, previousStatus?: string }} meta
 */
export async function updateOrderStatusWithAudit(supabase, orderId, newStatus, { userId, sessionId, previousStatus } = {}) {
  const { updateOrderStatus } = await import('./orders.js');
  await updateOrderStatus(supabase, orderId, newStatus);

  await appendAuditEvent(supabase, {
    event_type: AUDIT_EVENT_TYPE.ORDER_STATUS_CHANGED,
    user_id: userId,
    session_id: sessionId ?? null,
    entity_id: orderId,
    entity_type: 'order',
    payload: {
      previous_status: previousStatus ?? null,
      new_status: newStatus,
    },
  });
}
