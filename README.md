# day-trade-assistent-frontend

Frontend do agente autônomo de daytrade — React + Vite + Supabase Auth.

## Stack

- React 19 + Vite 8
- Supabase (Auth, Postgres, RLS, Edge Functions)
- React Router v6
- Jest + React Testing Library (unit/integration)
- Playwright (E2E)

## Setup rápido

```bash
cp .env.example .env
# preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

npm install
npm run dev
```

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run lint` | ESLint |
| `npm run test:unit` | Testes unitários (Jest + RTL) |
| `npm run test:integration` | Testes de integração (Jest + mocks) |
| `npm run test:e2e` | Testes E2E (Playwright) |
| `npm run test:all` | Todos os testes em sequência |

## Estrutura

```
src/
  lib/           # supabase.js, crypto.js (mascaramento/validação)
  hooks/         # useAuth, useApiKeys
  components/
    auth/        # LoginForm
    keys/        # ApiKeyManager, ApiKeyCard, ApiKeyForm
  pages/         # LoginPage, DashboardPage, ApiKeysPage
tests/
  auth/          # login.unit.test.js, login.integration.test.js
  keys/          # keys.unit.test.js, keys.integration.test.js
  e2e/           # auth.login.spec.js
.github/
  workflows/ci.yml
```

## Epic A — User Stories implementadas

| Story | Descrição | Testes |
|---|---|---|
| US-A1 | Login via Supabase Auth com validação de formulário | unit + integration + e2e |
| US-A2 | CRUD de chaves de API (mascaradas, RLS por usuário) | unit + integration |

## Segurança

- Chaves de API exibidas apenas mascaradas (`key_masked`); valor em claro nunca retorna ao frontend após salvar.
- Criptografia em repouso gerenciada pelo Supabase (pgcrypto) — backend criptografa antes de persistir.
- RLS no Supabase garante isolamento por `user_id`; mocks de integração validam esse comportamento.
- Credenciais e segredos nunca commitados; usar `.env` local (não versionado) e GitHub Secrets no CI.

## Como mockar serviços nos testes

- Supabase: `jest.mock('../../src/lib/supabase', () => ({ supabase: { auth: { ... }, from: jest.fn() } }))`
- Hook `useAuth`: `jest.mock('../../src/hooks/useAuth', () => ({ useAuth: jest.fn() }))`

## CI

O pipeline (`.github/workflows/ci.yml`) executa jobs separados: `lint → unit → integration → e2e`.
Merge bloqueado se qualquer job falhar. Coverage mínimo: 80% (linhas + branches).
