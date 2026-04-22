/**
 * US-D1/D2 — Testes de integração: pipeline de ingestão e retrieval.
 * Supabase e embeddingClient são injetados como mocks; zero chamadas reais.
 */

import { jest } from '@jest/globals';
import { ingestArticles } from '../../services/news/newsIngestion.js';
import { retrieveRelevant } from '../../services/news/newsRetrieval.js';

// ─── Helpers / fixtures ───────────────────────────────────────────────────────

function makeRawArticle(overrides = {}) {
  return {
    title: 'Bitcoin sobe 10%',
    content: 'Mercado reage positivamente ao halving.',
    source: 'CoinDesk',
    publishedAt: '2026-04-22T10:00:00Z',
    url: 'https://coindesk.com/btc-10',
    ...overrides,
  };
}

const FAKE_EMBEDDING = [0.1, 0.2, 0.3, 0.4, 0.5];

function makeEmbeddingClient() {
  return { embed: jest.fn().mockResolvedValue({ embedding: FAKE_EMBEDDING }) };
}

/**
 * Constrói um mock do Supabase configurável por cenário.
 *
 * @param {{ existingHashes?: string[], insertError?: string, fetchError?: string }} opts
 */
function makeSupabaseMock({ existingHashes = [], insertError = null, fetchError = null } = {}) {
  const insertFn = jest.fn().mockResolvedValue({
    error: insertError ? { message: insertError } : null,
  });

  const selectInFn = jest.fn().mockResolvedValue({
    data: existingHashes.map((h) => ({ content_hash: h })),
    error: fetchError ? { message: fetchError } : null,
  });

  return {
    from: jest.fn(() => ({
      select: jest.fn(() => ({ in: selectInFn })),
      insert: insertFn,
    })),
    rpc: jest.fn(),
    _insertFn: insertFn,
    _selectInFn: selectInFn,
  };
}

// ─── ingestArticles ───────────────────────────────────────────────────────────

describe('ingestArticles', () => {
  it('retorna { inserted: 0, duplicates: 0 } para array vazio', async () => {
    const supabase = makeSupabaseMock();
    const result = await ingestArticles(supabase, [], makeEmbeddingClient());
    expect(result).toEqual({ inserted: 0, duplicates: 0 });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('insere artigos novos e retorna contagem correta', async () => {
    const supabase = makeSupabaseMock();
    const client = makeEmbeddingClient();
    const articles = [makeRawArticle(), makeRawArticle({ url: 'https://example.com/other' })];

    const result = await ingestArticles(supabase, articles, client);

    expect(result.inserted).toBe(2);
    expect(result.duplicates).toBe(0);
    expect(client.embed).toHaveBeenCalledTimes(2);
    expect(supabase._insertFn).toHaveBeenCalledTimes(1);

    const insertedRows = supabase._insertFn.mock.calls[0][0];
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0]).toHaveProperty('content_hash');
    expect(insertedRows[0]).toHaveProperty('embedding', FAKE_EMBEDDING);
    expect(insertedRows[0]).toHaveProperty('published_at');
  });

  it('pula duplicatas que já existem no banco', async () => {
    const raw = makeRawArticle();

    // Precisamos saber o hash do artigo para simular duplicata
    const { hashArticle, normalizeArticle } = await import('../../services/news/newsNormalizer.js');
    const existingHash = hashArticle(normalizeArticle(raw));

    const supabase = makeSupabaseMock({ existingHashes: [existingHash] });
    const client = makeEmbeddingClient();

    const result = await ingestArticles(supabase, [raw], client);

    expect(result.inserted).toBe(0);
    expect(result.duplicates).toBe(1);
    expect(client.embed).not.toHaveBeenCalled();
    expect(supabase._insertFn).not.toHaveBeenCalled();
  });

  it('insere apenas os artigos novos quando lote misto (novos + duplicatas)', async () => {
    const dup = makeRawArticle();
    const novo = makeRawArticle({ url: 'https://example.com/novo' });

    const { hashArticle, normalizeArticle } = await import('../../services/news/newsNormalizer.js');
    const dupHash = hashArticle(normalizeArticle(dup));

    const supabase = makeSupabaseMock({ existingHashes: [dupHash] });
    const client = makeEmbeddingClient();

    const result = await ingestArticles(supabase, [dup, novo], client);

    expect(result.inserted).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(client.embed).toHaveBeenCalledTimes(1);
  });

  it('lança erro quando a consulta de hashes falha', async () => {
    const supabase = makeSupabaseMock({ fetchError: 'DB connection failed' });
    await expect(ingestArticles(supabase, [makeRawArticle()], makeEmbeddingClient()))
      .rejects.toThrow('DB connection failed');
  });

  it('lança erro quando o insert falha', async () => {
    const supabase = makeSupabaseMock({ insertError: 'Insert constraint violation' });
    await expect(ingestArticles(supabase, [makeRawArticle()], makeEmbeddingClient()))
      .rejects.toThrow('Insert constraint violation');
  });

  it('persiste os campos corretos na tabela embeddings', async () => {
    const supabase = makeSupabaseMock();
    const raw = makeRawArticle();
    await ingestArticles(supabase, [raw], makeEmbeddingClient());

    const rows = supabase._insertFn.mock.calls[0][0];
    const row = rows[0];

    expect(row).toMatchObject({
      title: raw.title,
      content: raw.content,
      source: raw.source,
      url: raw.url,
    });
    expect(typeof row.content_hash).toBe('string');
    expect(row.content_hash).toHaveLength(64);
    expect(Array.isArray(row.embedding)).toBe(true);
  });
});

// ─── retrieveRelevant ─────────────────────────────────────────────────────────

describe('retrieveRelevant', () => {
  const queryEmbedding = [0.1, 0.2, 0.3];

  it('retorna resultados ordenados por similarity decrescente', async () => {
    const rpcData = [
      { id: 'a', similarity: 0.6 },
      { id: 'b', similarity: 0.9 },
      { id: 'c', similarity: 0.75 },
    ];
    const supabase = { rpc: jest.fn().mockResolvedValue({ data: rpcData, error: null }) };

    const result = await retrieveRelevant(supabase, queryEmbedding, { topK: 3, windowHours: 24 });

    expect(result.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('chama o RPC com os parâmetros corretos', async () => {
    const supabase = { rpc: jest.fn().mockResolvedValue({ data: [], error: null }) };
    const before = Date.now();

    await retrieveRelevant(supabase, queryEmbedding, { topK: 10, windowHours: 48 });

    const after = Date.now();
    expect(supabase.rpc).toHaveBeenCalledWith('match_news_embeddings', expect.objectContaining({
      query_embedding: queryEmbedding,
      match_count: 10,
    }));

    const call = supabase.rpc.mock.calls[0][1];
    const minTs = new Date(call.min_published_at).getTime();
    expect(minTs).toBeGreaterThanOrEqual(before - 48 * 3600 * 1000 - 100);
    expect(minTs).toBeLessThanOrEqual(after - 48 * 3600 * 1000 + 100);
  });

  it('usa topK=5 e windowHours=24 como defaults', async () => {
    const supabase = { rpc: jest.fn().mockResolvedValue({ data: [], error: null }) };

    await retrieveRelevant(supabase, queryEmbedding);

    expect(supabase.rpc).toHaveBeenCalledWith('match_news_embeddings', expect.objectContaining({
      match_count: 5,
    }));
  });

  it('retorna array vazio quando RPC retorna null', async () => {
    const supabase = { rpc: jest.fn().mockResolvedValue({ data: null, error: null }) };
    const result = await retrieveRelevant(supabase, queryEmbedding);
    expect(result).toEqual([]);
  });

  it('lança erro quando RPC falha', async () => {
    const supabase = {
      rpc: jest.fn().mockResolvedValue({ data: null, error: { message: 'pgvector not available' } }),
    };
    await expect(retrieveRelevant(supabase, queryEmbedding)).rejects.toThrow('pgvector not available');
  });

  it('lança erro para queryEmbedding vazio', async () => {
    const supabase = { rpc: jest.fn() };
    await expect(retrieveRelevant(supabase, [])).rejects.toThrow('queryEmbedding');
    await expect(retrieveRelevant(supabase, null)).rejects.toThrow('queryEmbedding');
  });
});
