/**
 * US-D2 — Retrieval eficiente com top-k e janela temporal via pgvector.
 *
 * Requer a função RPC `match_news_embeddings` definida no Supabase:
 *
 * ```sql
 * CREATE OR REPLACE FUNCTION match_news_embeddings(
 *   query_embedding vector,
 *   match_count      int,
 *   min_published_at timestamptz
 * )
 * RETURNS TABLE (
 *   id           uuid,
 *   title        text,
 *   content      text,
 *   source       text,
 *   published_at timestamptz,
 *   url          text,
 *   similarity   float
 * ) LANGUAGE sql AS $$
 *   SELECT id, title, content, source, published_at, url,
 *          1 - (embedding <=> query_embedding) AS similarity
 *   FROM   embeddings
 *   WHERE  published_at >= min_published_at
 *   ORDER  BY embedding <=> query_embedding
 *   LIMIT  match_count;
 * $$;
 * ```
 */

/**
 * Ordena resultados por score de similaridade decrescente.
 * Não muta o array original.
 *
 * @param {{ similarity: number }[]} results
 * @returns {{ similarity: number }[]}
 */
export function rankByScore(results) {
  return [...results].sort((a, b) => b.similarity - a.similarity);
}

/**
 * Recupera os top-k documentos mais relevantes dentro de uma janela temporal.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number[]} queryEmbedding
 * @param {{ topK?: number, windowHours?: number }} options
 * @returns {Promise<object[]>}
 */
export async function retrieveRelevant(
  supabase,
  queryEmbedding,
  { topK = 5, windowHours = 24 } = {}
) {
  if (!queryEmbedding?.length) {
    throw new Error('queryEmbedding não pode ser vazio.');
  }

  const minPublishedAt = new Date(
    Date.now() - windowHours * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase.rpc('match_news_embeddings', {
    query_embedding: queryEmbedding,
    match_count: topK,
    min_published_at: minPublishedAt,
  });

  if (error) throw new Error(error.message);

  return rankByScore(data ?? []);
}
