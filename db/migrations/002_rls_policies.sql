-- =============================================================================
-- US-F1: Schema inicial do day_trade_assistent
-- Migration 002 — Row Level Security (RLS) policies
-- =============================================================================

-- =============================================================================
-- api_keys — isolamento total por usuário
-- =============================================================================
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys: usuário lê apenas as próprias"
  ON public.api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "api_keys: usuário insere apenas as próprias"
  ON public.api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "api_keys: usuário atualiza apenas as próprias"
  ON public.api_keys FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "api_keys: usuário remove apenas as próprias"
  ON public.api_keys FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- sessions — isolamento total por usuário
-- =============================================================================
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions: usuário lê apenas as próprias"
  ON public.sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "sessions: usuário insere apenas as próprias"
  ON public.sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sessions: usuário atualiza apenas as próprias"
  ON public.sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Sessões não podem ser deletadas (histórico imutável)
-- Nenhuma policy de DELETE criada intencionalmente.

-- =============================================================================
-- orders — isolamento total por usuário
-- =============================================================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders: usuário lê apenas as próprias"
  ON public.orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "orders: usuário insere apenas as próprias"
  ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "orders: usuário atualiza apenas as próprias"
  ON public.orders FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Ordens não podem ser deletadas (histórico imutável)

-- =============================================================================
-- audit_events — APPEND-ONLY: somente INSERT e SELECT por usuário.
-- UPDATE e DELETE são intencionalmente omitidos para garantir imutabilidade.
-- =============================================================================
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_events: usuário lê apenas os próprios"
  ON public.audit_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "audit_events: usuário insere apenas os próprios"
  ON public.audit_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- NÃO há policy de UPDATE — impossibilita alteração de eventos auditados.
-- NÃO há policy de DELETE — impossibilita remoção de eventos auditados.

-- =============================================================================
-- embeddings — leitura pública, escrita somente via service_role
-- (pipeline de ingestão usa service_role key no servidor)
-- =============================================================================
ALTER TABLE public.embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "embeddings: leitura pública"
  ON public.embeddings FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE exigem service_role (sem policy = acesso negado para anon/authenticated)
