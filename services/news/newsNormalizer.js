/**
 * US-D1 — Normalização e deduplicação de artigos de notícias.
 */

import { createHash } from 'crypto';

/**
 * Normaliza um artigo bruto para o formato interno.
 *
 * @param {object} raw
 * @param {string} [raw.title]
 * @param {string} [raw.content]
 * @param {string} [raw.description] fallback para content
 * @param {string} [raw.source]
 * @param {string} [raw.publishedAt]
 * @param {string} [raw.url]
 * @returns {{ title: string, content: string, source: string, publishedAt: string, url: string }}
 */
export function normalizeArticle(raw) {
  return {
    title: String(raw.title ?? '').trim(),
    content: String(raw.content ?? raw.description ?? '').trim(),
    source: String(raw.source ?? '').trim(),
    publishedAt: raw.publishedAt
      ? new Date(raw.publishedAt).toISOString()
      : new Date().toISOString(),
    url: String(raw.url ?? '').trim(),
  };
}

/**
 * Gera hash SHA-256 para deduplicação. Usa `url` como chave primária;
 * se ausente, concatena `title + publishedAt`.
 *
 * @param {{ title: string, url: string, publishedAt: string }} normalized
 * @returns {string}
 */
export function hashArticle(normalized) {
  const key = normalized.url
    ? normalized.url
    : `${normalized.title}::${normalized.publishedAt}`;
  return createHash('sha256').update(key).digest('hex');
}
