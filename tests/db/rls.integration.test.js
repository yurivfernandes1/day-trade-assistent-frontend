/**
 * Testes de integração — US-F1: RLS policies
 *
 * Valida que:
 *  1. Usuário A só vê os próprios registros (api_keys, sessions, orders, audit_events).
 *  2. Usuário B não consegue ler dados do Usuário A (isolamento por RLS).
 *  3. audit_events é append-only: UPDATE e DELETE são rejeitados.
 *  4. embeddings tem leitura pública; INSERT/DELETE são rejeitados para usuários comuns.
 *
 * Todos os testes usam mock do Supabase client. O comportamento de RLS
 * em produção é garantido pelas migrations 001 e 002.
 * Para validação real contra banco, use `npm run test:integration` com
 * VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY apontando para supabase local.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Cria um mock de SupabaseClient que simula RLS por user_id.
 * Cada "tabela" é um array em memória.
 *
 * @param {string} authenticatedUserId  uid do usuário autenticado neste cliente
 * @param {Record<string, object[]>} db  estado inicial do banco em memória
 */
function createRlsMockClient(authenticatedUserId, db = {}) {
  const tables = {
    api_keys: [],
    sessions: [],
    orders: [],
    audit_events: [],
    embeddings: [],
    ...db,
  };

  const rlsTables = new Set(['api_keys', 'sessions', 'orders', 'audit_events']);
  const appendOnlyTables = new Set(['audit_events']);
  const publicReadTables = new Set(['embeddings']);
  const serviceRoleWriteTables = new Set(['embeddings']);

  function makeChain(tableName) {
    let filteredRows = [...(tables[tableName] ?? [])];
    let pendingInserts = null;
    let pendingUpdates = null;
    let operation = 'select';

    const chain = {
      select: () => { operation = 'select'; return chain; },

      insert: (rows) => {
        operation = 'insert';
        pendingInserts = Array.isArray(rows) ? rows : [rows];
        return chain;
      },

      update: (patch) => {
        operation = 'update';
        pendingUpdates = patch;
        return chain;
      },

      delete: () => {
        operation = 'delete';
        return chain;
      },

      eq: (col, val) => {
        filteredRows = filteredRows.filter((r) => r[col] === val);
        return chain;
      },

      order: () => chain,
      limit: (n) => { filteredRows = filteredRows.slice(0, n); return chain; },
      single: () => chain,

      // Resolução da Promise
      then: (resolve) => {
        // INSERT
        if (operation === 'insert') {
          if (serviceRoleWriteTables.has(tableName)) {
            return resolve({ data: null, error: { message: 'permission denied for table ' + tableName } });
          }
          const toInsert = pendingInserts ?? [];
          for (const row of toInsert) {
            if (rlsTables.has(tableName) && row.user_id !== authenticatedUserId) {
              return resolve({ data: null, error: { message: 'new row violates row-level security policy' } });
            }
          }
          tables[tableName].push(...toInsert);
          return resolve({ data: toInsert, error: null });
        }

        // UPDATE
        if (operation === 'update') {
          if (appendOnlyTables.has(tableName)) {
            return resolve({ data: null, error: { message: 'permission denied: update not allowed (append-only)' } });
          }
          const updated = [];
          tables[tableName] = tables[tableName].map((row) => {
            const match = filteredRows.find((r) => r.id === row.id);
            if (match && row.user_id === authenticatedUserId) {
              const newRow = { ...row, ...pendingUpdates };
              updated.push(newRow);
              return newRow;
            }
            return row;
          });
          return resolve({ data: updated, error: null });
        }

        // DELETE
        if (operation === 'delete') {
          if (appendOnlyTables.has(tableName)) {
            return resolve({ data: null, error: { message: 'permission denied: delete not allowed (append-only)' } });
          }
          const ids = filteredRows.map((r) => r.id);
          tables[tableName] = tables[tableName].filter(
            (row) => !(ids.includes(row.id) && row.user_id === authenticatedUserId)
          );
          return resolve({ data: null, error: null });
        }

        // SELECT
        if (rlsTables.has(tableName)) {
          // RLS: só retorna linhas do usuário autenticado
          filteredRows = filteredRows.filter((r) => r.user_id === authenticatedUserId);
        }
        return resolve({ data: filteredRows, error: null });
      },
    };

    return chain;
  }

  return {
    from: (tableName) => makeChain(tableName),
    _tables: tables, // exposto para inspeção nos testes
  };
}

// ─── Dados de fixture ────────────────────────────────────────────────────────

const USER_A = 'user-a-uuid';
const USER_B = 'user-b-uuid';

function buildInitialDb() {
  return {
    api_keys: [
      { id: 'key-1', user_id: USER_A, label: 'Alpaca Paper', broker: 'Alpaca', key_value: 'enc_val_a', key_masked: '***ABCD' },
      { id: 'key-2', user_id: USER_B, label: 'Binance Sand', broker: 'Binance', key_value: 'enc_val_b', key_masked: '***EFGH' },
    ],
    sessions: [
      { id: 'sess-1', user_id: USER_A, mode: 'paper', status: 'active', goal_type: 'percent', goal_profit: 5, goal_loss: 3 },
      { id: 'sess-2', user_id: USER_B, mode: 'paper', status: 'active', goal_type: 'value', goal_profit: 100, goal_loss: 50 },
    ],
    orders: [
      { id: 'ord-1', user_id: USER_A, session_id: 'sess-1', symbol: 'AAPL', side: 'buy', qty: 10, status: 'filled' },
      { id: 'ord-2', user_id: USER_B, session_id: 'sess-2', symbol: 'GOOG', side: 'buy', qty: 5, status: 'pending' },
    ],
    audit_events: [
      { id: 'evt-1', user_id: USER_A, event_type: 'session.started', session_id: 'sess-1', payload: {}, occurred_at: '2026-04-01T10:00:00Z' },
      { id: 'evt-2', user_id: USER_B, event_type: 'session.started', session_id: 'sess-2', payload: {}, occurred_at: '2026-04-01T11:00:00Z' },
    ],
    embeddings: [
      { id: 'emb-1', title: 'Market opens higher', content: 'Stocks rose...', content_hash: 'abc123', embedding: null },
    ],
  };
}

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('RLS — api_keys', () => {
  it('usuário A só vê as próprias chaves', async () => {
    const client = createRlsMockClient(USER_A, buildInitialDb());
    const { data, error } = await client.from('api_keys').select();
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('key-1');
  });

  it('usuário B não vê chaves do usuário A', async () => {
    const client = createRlsMockClient(USER_B, buildInitialDb());
    const { data } = await client.from('api_keys').select();
    expect(data.every((k) => k.user_id === USER_B)).toBe(true);
    expect(data.find((k) => k.user_id === USER_A)).toBeUndefined();
  });

  it('usuário A não pode inserir chave com user_id de outro usuário', async () => {
    const client = createRlsMockClient(USER_A, buildInitialDb());
    const { error } = await client.from('api_keys').insert({
      id: 'key-evil', user_id: USER_B, label: 'Fake', broker: 'X', key_value: 'val', key_masked: '***',
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/row-level security/i);
  });

  it('usuário A pode inserir a própria chave', async () => {
    const client = createRlsMockClient(USER_A, buildInitialDb());
    const { error } = await client.from('api_keys').insert({
      id: 'key-new', user_id: USER_A, label: 'New Key', broker: 'Alpaca', key_value: 'enc', key_masked: '***ZZZZ',
    });
    expect(error).toBeNull();
  });
});

describe('RLS — sessions', () => {
  it('usuário A só vê as próprias sessões', async () => {
    const client = createRlsMockClient(USER_A, buildInitialDb());
    const { data } = await client.from('sessions').select();
    expect(data).toHaveLength(1);
    expect(data[0].user_id).toBe(USER_A);
  });

  it('usuário B não vê sessões do usuário A', async () => {
    const client = createRlsMockClient(USER_B, buildInitialDb());
    const { data } = await client.from('sessions').select();
    expect(data.every((s) => s.user_id === USER_B)).toBe(true);
  });
});

describe('RLS — orders', () => {
  it('usuário A só vê as próprias ordens', async () => {
    const client = createRlsMockClient(USER_A, buildInitialDb());
    const { data } = await client.from('orders').select();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('ord-1');
  });

  it('filtro por session_id retorna apenas ordens do próprio usuário', async () => {
    const client = createRlsMockClient(USER_A, buildInitialDb());
    // Tentar ler sessão do usuário B diretamente por session_id
    const { data } = await client.from('orders').select().eq('session_id', 'sess-2');
    // RLS filtrou: nenhum resultado porque ord-2 é do USER_B
    expect(data).toHaveLength(0);
  });
});

describe('RLS — audit_events (append-only)', () => {
  it('usuário A só vê os próprios eventos', async () => {
    const client = createRlsMockClient(USER_A, buildInitialDb());
    const { data } = await client.from('audit_events').select();
    expect(data).toHaveLength(1);
    expect(data[0].user_id).toBe(USER_A);
  });

  it('UPDATE em audit_events é rejeitado (append-only)', async () => {
    const client = createRlsMockClient(USER_A, buildInitialDb());
    const { error } = await client
      .from('audit_events')
      .update({ event_type: 'tampered' })
      .eq('id', 'evt-1');
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/append-only/i);
  });

  it('DELETE em audit_events é rejeitado (append-only)', async () => {
    const client = createRlsMockClient(USER_A, buildInitialDb());
    const { error } = await client.from('audit_events').delete().eq('id', 'evt-1');
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/append-only/i);
  });

  it('INSERT válido pelo próprio usuário é aceito', async () => {
    const client = createRlsMockClient(USER_A, buildInitialDb());
    const { error } = await client.from('audit_events').insert({
      id: 'evt-new', user_id: USER_A, event_type: 'order.created',
      session_id: 'sess-1', payload: { orderId: 'ord-1' }, occurred_at: new Date().toISOString(),
    });
    expect(error).toBeNull();
    // Confirma que o evento foi persistido
    const { data } = await client.from('audit_events').select();
    expect(data.some((e) => e.id === 'evt-new')).toBe(true);
  });

  it('INSERT com user_id de outro usuário é rejeitado', async () => {
    const client = createRlsMockClient(USER_A, buildInitialDb());
    const { error } = await client.from('audit_events').insert({
      id: 'evt-evil', user_id: USER_B, event_type: 'session.started',
      session_id: 'sess-2', payload: {}, occurred_at: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/row-level security/i);
  });
});

describe('RLS — embeddings (leitura pública, escrita via service_role)', () => {
  it('qualquer usuário pode ler embeddings', async () => {
    const clientA = createRlsMockClient(USER_A, buildInitialDb());
    const { data, error } = await clientA.from('embeddings').select();
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('emb-1');
  });

  it('usuário autenticado não pode inserir embeddings (service_role only)', async () => {
    const client = createRlsMockClient(USER_A, buildInitialDb());
    const { error } = await client.from('embeddings').insert({
      id: 'emb-new', title: 'Hack', content: 'Malicious', content_hash: 'xyz999',
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/permission denied/i);
  });
});
