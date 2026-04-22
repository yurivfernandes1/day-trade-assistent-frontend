/**
 * US-D1 — Pipeline de ingestão de notícias com embeddings para pgvector.
 *
 * Fluxo:
 *  1. Normaliza artigos brutos.
 *  2. Gera hash de cada artigo para deduplicação.
 *  3. Consulta o Supabase para obter hashes já existentes.
 *  4. Gera embeddings apenas para artigos novos.
 *  5. Persiste na tabela `embeddings`.
 */

import { normalizeArticle, hashArticle } from './newsNormalizer.js';
import { generateEmbedding } from './newsEmbeddings.js';

/**
 * Ingere um lote de artigos brutos no pipeline RAG.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object[]} rawArticles
 * @param {{ embed: (text: string) => Promise<{ embedding: number[] }> }} embeddingClient
 * @returns {Promise<{ inserted: number, duplicates: number }>}
 */
export async function ingestArticles(supabase, rawArticles, embeddingClient) {
  if (!rawArticles?.length) return { inserted: 0, duplicates: 0 };

  const normalized = rawArticles.map(normalizeArticle);
  const withHashes = normalized.map((article) => ({
    ...article,
    hash: hashArticle(article),
  }));

  const hashes = withHashes.map((a) => a.hash);

  const { data: existing, error: fetchError } = await supabase
    .from('embeddings')
    .select('content_hash')
    .in('content_hash', hashes);

  if (fetchError) throw new Error(fetchError.message);

  const existingSet = new Set((existing ?? []).map((r) => r.content_hash));
  const newArticles = withHashes.filter((a) => !existingSet.has(a.hash));

  if (!newArticles.length) {
    return { inserted: 0, duplicates: withHashes.length };
  }

  const rows = await Promise.all(
    newArticles.map(async (article) => {
      const embeddingText = [article.title, article.content].filter(Boolean).join('\n');
      const embedding = await generateEmbedding(embeddingText, embeddingClient);
      return {
        title: article.title,
        content: article.content,
        source: article.source,
        published_at: article.publishedAt,
        url: article.url,
        content_hash: article.hash,
        embedding,
      };
    })
  );

  const { error: insertError } = await supabase.from('embeddings').insert(rows);
  if (insertError) throw new Error(insertError.message);

  return { inserted: newArticles.length, duplicates: existingSet.size };
}
