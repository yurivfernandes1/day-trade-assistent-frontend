import { jest } from '@jest/globals';

/**
 * US-G1 — Integration tests: Audit Log (append-only)
 *
 * Verifica que:
 * 1. Eventos de auditoria são inseridos com todos os campos obrigatórios.
 * 2. O mecanismo é append-only: nenhum UPDATE/DELETE é chamado.
 * 3. Criação de ordem gera evento de auditoria associado.
 * 4. Mudança de status gera um NOVO evento (não sobrescreve o anterior).
 * 5. Listagem retorna eventos filtrados e ordenados (mais recente primeiro).
 * 6. Erros do Supabase são propagados corretamente.
 */

import {
  AUDIT_EVENT_TYPE,
  appendAuditEvent,
  listAuditEvents,
  persistOrderWithAudit,
  updateOrderStatusWithAudit,
} from '../../src/lib/auditLog.js';

// ── helpers de mock ──────────────────────────────────────────────────────────

function makeSupabaseMock({ insertData = null, insertError = null, selectData = [], selectError = null } = {}) {
  const mockSingle = jest.fn().mockResolvedValue({
    data: insertData ?? { id: 'evt-1', event_type: 'order.created', occurred_at: new Date().toISOString() },
    error: insertError,
  });
  const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
  const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });

  // Para listAuditEvents: encadeia .select().eq().order().limit()
  const mockLimit = jest.fn().mockResolvedValue({ data: selectData, error: selectError });
  const mockOrder = jest.fn().mockReturnValue({ limit: mockLimit, eq: jest.fn().mockReturnValue({ limit: mockLimit }) });
  const mockEq = jest.fn().mockReturnValue({ order: mockOrder });
  const mockSelectQuery = jest.fn().mockReturnValue({ eq: mockEq });

  const mockFrom = jest.fn((table) => {
    if (table === 'audit_events') {
      return {
        insert: mockInsert,
        select: mockSelectQuery,
      };
    }
    // tabela orders — para persistOrderWithAudit / updateOrderStatusWithAudit
    return {
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'ord-1', session_id: 'sess-1', symbol: 'BTC/USDT', side: 'buy', qty: 1, status: 'pending' },
            error: null,
          }),
        }),
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    };
  });

  return { mockFrom, mockInsert, mockSingle, mockOrder, mockLimit };
}

// ── appendAuditEvent ─────────────────────────────────────────────────────────

describe('appendAuditEvent', () => {
  it('insere o evento com todos os campos obrigatórios', async () => {
    const { mockFrom, mockInsert } = makeSupabaseMock();
    const supabase = { from: mockFrom };

    const eventData = {
      event_type: AUDIT_EVENT_TYPE.ORDER_CREATED,
      user_id: 'user-1',
      session_id: 'sess-1',
      entity_id: 'ord-1',
      entity_type: 'order',
      payload: { symbol: 'BTC/USDT', side: 'buy', qty: 1 },
    };

    const result = await appendAuditEvent(supabase, eventData);

    expect(mockFrom).toHaveBeenCalledWith('audit_events');
    const [inserted] = mockInsert.mock.calls[0][0];
    expect(inserted).toMatchObject({
      event_type: AUDIT_EVENT_TYPE.ORDER_CREATED,
      user_id: 'user-1',
      session_id: 'sess-1',
      entity_id: 'ord-1',
      entity_type: 'order',
      payload: expect.objectContaining({ symbol: 'BTC/USDT' }),
    });
    expect(inserted.occurred_at).toBeDefined();
    expect(result).toHaveProperty('id', 'evt-1');
  });

  it('preenche campos opcionais com null quando não fornecidos', async () => {
    const { mockFrom, mockInsert } = makeSupabaseMock();
    const supabase = { from: mockFrom };

    await appendAuditEvent(supabase, {
      event_type: AUDIT_EVENT_TYPE.SESSION_STARTED,
      user_id: 'user-2',
    });

    const [inserted] = mockInsert.mock.calls[0][0];
    expect(inserted.session_id).toBeNull();
    expect(inserted.entity_id).toBeNull();
    expect(inserted.entity_type).toBeNull();
    expect(inserted.payload).toEqual({});
  });

  it('NUNCA chama update ou delete — apenas insert (append-only)', async () => {
    const mockUpdate = jest.fn();
    const mockDelete = jest.fn();
    const mockInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: 'e1' }, error: null }),
      }),
    });
    const supabase = {
      from: jest.fn(() => ({ insert: mockInsert, update: mockUpdate, delete: mockDelete })),
    };

    await appendAuditEvent(supabase, {
      event_type: AUDIT_EVENT_TYPE.API_KEY_ADDED,
      user_id: 'user-1',
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('propaga erro do Supabase como exceção', async () => {
    const { mockFrom } = makeSupabaseMock({ insertError: { message: 'RLS violation' } });
    const supabase = { from: mockFrom };

    await expect(
      appendAuditEvent(supabase, { event_type: AUDIT_EVENT_TYPE.ORDER_CREATED, user_id: 'u1' })
    ).rejects.toThrow('RLS violation');
  });
});

// ── listAuditEvents ──────────────────────────────────────────────────────────

describe('listAuditEvents', () => {
  const fakeEvents = [
    { id: 'e3', event_type: 'order.status_changed', occurred_at: '2026-04-23T10:00:00Z' },
    { id: 'e2', event_type: 'order.created', occurred_at: '2026-04-23T09:00:00Z' },
    { id: 'e1', event_type: 'session.started', occurred_at: '2026-04-23T08:00:00Z' },
  ];

  it('retorna eventos ordenados mais recente primeiro', async () => {
    const { mockFrom } = makeSupabaseMock({ selectData: fakeEvents });
    const supabase = { from: mockFrom };

    const results = await listAuditEvents(supabase, { userId: 'user-1' });

    expect(mockFrom).toHaveBeenCalledWith('audit_events');
    expect(results).toHaveLength(3);
    expect(results[0].id).toBe('e3');
  });

  it('retorna array vazio quando não há eventos', async () => {
    const { mockFrom } = makeSupabaseMock({ selectData: null });
    const supabase = { from: mockFrom };

    const results = await listAuditEvents(supabase, { userId: 'user-x' });
    expect(results).toEqual([]);
  });

  it('aplica filtro sessionId antes de order/limit (não quebra a chain)', async () => {
    // Monta um mock que rastreia a ordem das chamadas na chain
    const mockLimit = jest.fn().mockResolvedValue({ data: [], error: null });
    const mockOrder = jest.fn().mockReturnValue({ limit: mockLimit });
    const mockSessionEq = jest.fn().mockReturnValue({ order: mockOrder });
    const mockUserEq = jest.fn().mockReturnValue({ order: mockOrder, eq: mockSessionEq });
    const mockSelectQ = jest.fn().mockReturnValue({ eq: mockUserEq });
    const supabase = { from: jest.fn(() => ({ select: mockSelectQ })) };

    await listAuditEvents(supabase, { userId: 'u1', sessionId: 'sess-99' });

    // sessionId filter foi aplicado antes de order/limit
    expect(mockSessionEq).toHaveBeenCalledWith('session_id', 'sess-99');
    expect(mockOrder).toHaveBeenCalledWith('occurred_at', { ascending: false });
    expect(mockLimit).toHaveBeenCalledWith(100);
  });

  it('propaga erro do Supabase', async () => {
    const { mockFrom } = makeSupabaseMock({ selectError: { message: 'DB error' } });
    const supabase = { from: mockFrom };

    await expect(listAuditEvents(supabase, { userId: 'u1' })).rejects.toThrow('DB error');
  });
});

// ── persistOrderWithAudit ────────────────────────────────────────────────────

describe('persistOrderWithAudit', () => {
  it('persiste a ordem E gera evento de auditoria ORDER_CREATED', async () => {
    const auditInsertMock = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: 'evt-new' }, error: null }),
      }),
    });
    const orderInsertMock = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { id: 'ord-10', session_id: 'sess-1', symbol: 'ETH/USDT', side: 'buy', qty: 2, status: 'pending' },
          error: null,
        }),
      }),
    });

    const supabase = {
      from: jest.fn((table) => {
        if (table === 'orders') return { insert: orderInsertMock };
        if (table === 'audit_events') return { insert: auditInsertMock };
      }),
    };

    const order = await persistOrderWithAudit(
      supabase,
      { session_id: 'sess-1', symbol: 'ETH/USDT', side: 'buy', qty: 2, status: 'pending' },
      'user-1'
    );

    // Ordem foi persistida
    expect(orderInsertMock).toHaveBeenCalledTimes(1);
    expect(order).toHaveProperty('id', 'ord-10');

    // Evento de auditoria foi criado com entity_id = id da ordem
    expect(auditInsertMock).toHaveBeenCalledTimes(1);
    const [auditRecord] = auditInsertMock.mock.calls[0][0];
    expect(auditRecord.event_type).toBe(AUDIT_EVENT_TYPE.ORDER_CREATED);
    expect(auditRecord.entity_id).toBe('ord-10');
    expect(auditRecord.user_id).toBe('user-1');
    expect(auditRecord.payload).toMatchObject({ symbol: 'ETH/USDT', side: 'buy' });
  });
});

// ── updateOrderStatusWithAudit ───────────────────────────────────────────────

describe('updateOrderStatusWithAudit', () => {
  it('atualiza o status e gera NOVO evento de auditoria ORDER_STATUS_CHANGED', async () => {
    const auditInsertMock = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: 'evt-status' }, error: null }),
      }),
    });
    const orderUpdateMock = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    });

    const supabase = {
      from: jest.fn((table) => {
        if (table === 'orders') return { update: orderUpdateMock };
        if (table === 'audit_events') return { insert: auditInsertMock };
      }),
    };

    await updateOrderStatusWithAudit(supabase, 'ord-5', 'filled', {
      userId: 'user-1',
      sessionId: 'sess-1',
      previousStatus: 'pending',
    });

    // Status atualizado
    expect(orderUpdateMock).toHaveBeenCalledTimes(1);

    // Novo evento de auditoria (não sobrescreve o anterior)
    expect(auditInsertMock).toHaveBeenCalledTimes(1);
    const [auditRecord] = auditInsertMock.mock.calls[0][0];
    expect(auditRecord.event_type).toBe(AUDIT_EVENT_TYPE.ORDER_STATUS_CHANGED);
    expect(auditRecord.entity_id).toBe('ord-5');
    expect(auditRecord.payload).toMatchObject({
      previous_status: 'pending',
      new_status: 'filled',
    });
  });

  it('cada mudança de status gera evento independente — trilha auditável', async () => {
    const auditEvents = [];
    const auditInsertMock = jest.fn((records) => {
      auditEvents.push(...records);
      return {
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: { id: `evt-${auditEvents.length}` }, error: null }),
        }),
      };
    });
    const orderUpdateMock = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    });
    const supabase = {
      from: jest.fn((table) => {
        if (table === 'orders') return { update: orderUpdateMock };
        if (table === 'audit_events') return { insert: auditInsertMock };
      }),
    };

    await updateOrderStatusWithAudit(supabase, 'ord-7', 'filled', {
      userId: 'u1', previousStatus: 'pending',
    });
    await updateOrderStatusWithAudit(supabase, 'ord-7', 'cancelled', {
      userId: 'u1', previousStatus: 'filled',
    });

    // Dois eventos independentes gerados (append-only)
    expect(auditInsertMock).toHaveBeenCalledTimes(2);
    expect(auditEvents[0].payload.new_status).toBe('filled');
    expect(auditEvents[1].payload.new_status).toBe('cancelled');
    expect(auditEvents[0].payload.previous_status).toBe('pending');
    expect(auditEvents[1].payload.previous_status).toBe('filled');
  });
});
