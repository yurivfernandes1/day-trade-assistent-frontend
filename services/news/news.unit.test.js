/**
 * US-D1/D2 — Testes unitários: normalização, hashing e ranking.
 */

import { jest } from '@jest/globals';
import { normalizeArticle, hashArticle } from '../../services/news/newsNormalizer.js';
import { generateEmbedding } from '../../services/news/newsEmbeddings.js';
import { rankByScore } from '../../services/news/newsRetrieval.js';

// ─── normalizeArticle ────────────────────────────────────────────────────────

describe('normalizeArticle', () => {
  const base = {
    title: '  Bitcoin sobe 10%  ',
    content: 'Mercado reage positivamente.',
    source: 'CoinDesk',
    publishedAt: '2026-04-22T10:00:00Z',
    url: 'https://coindesk.com/btc-10',
  };

  it('normaliza campos com trim e converte publishedAt para ISO', () => {
    const result = normalizeArticle(base);
    expect(result.title).toBe('Bitcoin sobe 10%');
    expect(result.content).toBe('Mercado reage positivamente.');
    expect(result.source).toBe('CoinDesk');
    expect(result.publishedAt).toBe(new Date('2026-04-22T10:00:00Z').toISOString());
    expect(result.url).toBe('https://coindesk.com/btc-10');
  });

  it('usa description como fallback quando content está ausente', () => {
    const result = normalizeArticle({ ...base, content: undefined, description: 'Fallback desc' });
    expect(result.content).toBe('Fallback desc');
  });

  it('retorna string vazia para campos ausentes', () => {
    const result = normalizeArticle({});
    expect(result.title).toBe('');
    expect(result.content).toBe('');
    expect(result.source).toBe('');
    expect(result.url).toBe('');
  });

  it('define publishedAt como data atual quando ausente', () => {
    const before = Date.now();
    const result = normalizeArticle({});
    const after = Date.now();
    const ts = new Date(result.publishedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('converte valores não-string para string', () => {
    const result = normalizeArticle({ title: 42, source: null });
    expect(result.title).toBe('42');
    expect(result.source).toBe('');
  });
});

// ─── hashArticle ─────────────────────────────────────────────────────────────

describe('hashArticle', () => {
  const article = {
    title: 'Bitcoin sobe 10%',
    publishedAt: '2026-04-22T10:00:00.000Z',
    url: 'https://coindesk.com/btc-10',
  };

  it('retorna uma string hex de 64 caracteres (SHA-256)', () => {
    const hash = hashArticle(article);
    expect(typeof hash).toBe('string');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('é determinístico para o mesmo artigo', () => {
    expect(hashArticle(article)).toBe(hashArticle({ ...article }));
  });

  it('usa url como chave primária de deduplicação', () => {
    const a1 = { title: 'Título A', url: 'https://example.com/a', publishedAt: '2026-01-01T00:00:00.000Z' };
    const a2 = { title: 'Título B', url: 'https://example.com/a', publishedAt: '2026-01-02T00:00:00.000Z' };
    // mesma url → mesmo hash (duplicata)
    expect(hashArticle(a1)).toBe(hashArticle(a2));
  });

  it('usa title+publishedAt quando url está vazia', () => {
    const a1 = { title: 'Título X', url: '', publishedAt: '2026-01-01T00:00:00.000Z' };
    const a2 = { title: 'Título X', url: '', publishedAt: '2026-01-02T00:00:00.000Z' };
    // mesmo título mas datas diferentes → hashes distintos
    expect(hashArticle(a1)).not.toBe(hashArticle(a2));
  });

  it('artigos com urls distintas geram hashes distintos', () => {
    const a1 = { ...article, url: 'https://example.com/1' };
    const a2 = { ...article, url: 'https://example.com/2' };
    expect(hashArticle(a1)).not.toBe(hashArticle(a2));
  });
});

// ─── generateEmbedding ───────────────────────────────────────────────────────

describe('generateEmbedding', () => {
  const mockClient = { embed: jest.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }) };

  beforeEach(() => mockClient.embed.mockClear());

  it('retorna o array de embedding do cliente', async () => {
    const result = await generateEmbedding('texto qualquer', mockClient);
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(mockClient.embed).toHaveBeenCalledWith('texto qualquer');
  });

  it('lança erro quando texto é vazio', async () => {
    await expect(generateEmbedding('', mockClient)).rejects.toThrow('vazio');
    await expect(generateEmbedding('   ', mockClient)).rejects.toThrow('vazio');
  });

  it('lança erro quando embeddingClient não implementa embed()', async () => {
    await expect(generateEmbedding('texto', {})).rejects.toThrow('embeddingClient');
    await expect(generateEmbedding('texto', null)).rejects.toThrow('embeddingClient');
  });

  it('lança erro quando cliente retorna resposta inválida', async () => {
    mockClient.embed.mockResolvedValueOnce({ embedding: null });
    await expect(generateEmbedding('texto', mockClient)).rejects.toThrow('inválida');

    mockClient.embed.mockResolvedValueOnce({});
    await expect(generateEmbedding('texto', mockClient)).rejects.toThrow('inválida');
  });
});

// ─── rankByScore ─────────────────────────────────────────────────────────────

describe('rankByScore', () => {
  it('ordena por similarity decrescente', () => {
    const input = [
      { id: 'a', similarity: 0.5 },
      { id: 'b', similarity: 0.9 },
      { id: 'c', similarity: 0.7 },
    ];
    const result = rankByScore(input);
    expect(result.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('não muta o array original', () => {
    const input = [{ similarity: 0.3 }, { similarity: 0.8 }];
    const original = [...input];
    rankByScore(input);
    expect(input).toEqual(original);
  });

  it('retorna array vazio para entrada vazia', () => {
    expect(rankByScore([])).toEqual([]);
  });

  it('mantém a ordem em empate de scores', () => {
    const input = [
      { id: 'x', similarity: 0.7 },
      { id: 'y', similarity: 0.7 },
    ];
    const result = rankByScore(input);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.similarity === 0.7)).toBe(true);
  });
});
