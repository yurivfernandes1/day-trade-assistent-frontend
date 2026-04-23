-- =============================================================================
-- US-F1: Schema inicial do day_trade_assistent
-- Migration 001 — Criação das tabelas principais
-- =============================================================================

-- Extensão necessária para geração de UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Extensão pgvector para embeddings (tabela embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- Tabela: api_keys
-- Armazena as chaves de API de corretoras por usuário.
-- key_value e secret_value ficam criptografados em repouso (pgcrypto).
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.api_keys (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label        text        NOT NULL,
  broker       text        NOT NULL,
  key_value    text        NOT NULL,   -- valor criptografado em repouso
  secret_value text,                   -- valor criptografado em repouso (opcional)
  key_masked   text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Tabela: sessions
-- Sessões de trading por usuário com modo (paper/real) e metas de ganho/perda.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode        text        NOT NULL CHECK (mode IN ('paper', 'real')),
  status      text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stopped')),
  goal_type   text        NOT NULL CHECK (goal_type IN ('percent', 'value')),
  goal_profit numeric     NOT NULL CHECK (goal_profit > 0),
  goal_loss   numeric     NOT NULL CHECK (goal_loss > 0),
  started_at  timestamptz NOT NULL DEFAULT now(),
  stopped_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Tabela: orders
-- Ordens de compra/venda vinculadas a uma sessão.
-- open_order_id: referência à ordem de BUY que esta SELL está fechando.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id      uuid        NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  symbol          text        NOT NULL,
  side            text        NOT NULL CHECK (side IN ('buy', 'sell')),
  qty             numeric     NOT NULL CHECK (qty > 0),
  price           numeric,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'filled', 'rejected', 'cancelled')),
  broker_order_id text,
  open_order_id   uuid        REFERENCES public.orders(id),
  close_reason    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Tabela: audit_events
-- Log imutável de auditoria (append-only).
-- RLS proíbe UPDATE e DELETE — ver migration 002.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.audit_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  text        NOT NULL,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id  uuid        REFERENCES public.sessions(id),
  entity_id   text,
  entity_type text,
  payload     jsonb       NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Tabela: embeddings
-- Armazena artigos de notícias normalizados com vetores pgvector para RAG.
-- content_hash garante deduplicação por URL ou título+data.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.embeddings (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text        NOT NULL,
  content      text        NOT NULL,
  source       text,
  url          text,
  content_hash text        NOT NULL UNIQUE,
  embedding    vector(1536),
  published_at timestamptz,
  ingested_at  timestamptz NOT NULL DEFAULT now()
);

-- Índice HNSW para busca por similaridade vetorial (top-k)
CREATE INDEX IF NOT EXISTS embeddings_embedding_hnsw
  ON public.embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Índice para filtragem por janela temporal
CREATE INDEX IF NOT EXISTS embeddings_published_at_idx
  ON public.embeddings (published_at DESC);
