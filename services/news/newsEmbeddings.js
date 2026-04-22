/**
 * US-D1 — Geração de embeddings para artigos de notícias.
 *
 * O cliente de embeddings é injetado (dependency injection) para facilitar
 * testes e troca de provedor (OpenAI, Cohere, etc.).
 * O cliente deve expor: `embed(text: string): Promise<{ embedding: number[] }>`.
 */

/**
 * Gera embedding vetorial para um texto.
 *
 * @param {string} text
 * @param {{ embed: (text: string) => Promise<{ embedding: number[] }> }} embeddingClient
 * @returns {Promise<number[]>}
 */
export async function generateEmbedding(text, embeddingClient) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new Error('O texto para embedding não pode ser vazio.');
  }
  if (!embeddingClient || typeof embeddingClient.embed !== 'function') {
    throw new Error('embeddingClient é obrigatório e deve implementar embed(text).');
  }

  const response = await embeddingClient.embed(text.trim());

  if (!response?.embedding || !Array.isArray(response.embedding)) {
    throw new Error('embeddingClient retornou resposta inválida.');
  }

  return response.embedding;
}
