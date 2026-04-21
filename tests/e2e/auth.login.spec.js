import { test, expect } from '@playwright/test';

/**
 * E2E — US-A1: Fluxo completo de login
 * Requer app rodando em localhost:5173 com Supabase configurado em .env
 * Em CI, usar VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY como secrets.
 */
test.describe('Fluxo de login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('exibe formulário de login', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /entrar/i })).toBeVisible();
    await expect(page.getByLabel(/e-mail/i)).toBeVisible();
    await expect(page.getByLabel(/senha/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible();
  });

  test('exibe erro de validação para email inválido', async ({ page }) => {
    await page.getByLabel(/e-mail/i).fill('email-invalido');
    await page.getByLabel(/senha/i).fill('senha123');
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page.getByRole('alert').first()).toContainText(/e-mail válido/i);
  });

  test('exibe erro de validação para senha curta', async ({ page }) => {
    await page.getByLabel(/e-mail/i).fill('user@example.com');
    await page.getByLabel(/senha/i).fill('123');
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page.getByRole('alert').first()).toContainText(/ao menos 6/i);
  });

  test('redireciona para /login ao tentar acessar rota protegida sem sessão', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
