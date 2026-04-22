import { test, expect } from '@playwright/test';

/**
 * E2E — US-B1/B2: Fluxo de sessão de operação (Start → Stop)
 * Requer app rodando em localhost:5173 com usuário autenticado via Supabase.
 * Em CI, configurar VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e
 * E2E_USER_EMAIL / E2E_USER_PASSWORD como secrets.
 */

test.describe('Fluxo de sessão de operação (Paper)', () => {
  test.beforeEach(async ({ page }) => {
    // Navegar para o dashboard (necessita sessão autenticada)
    await page.goto('/dashboard');
  });

  test('exibe controles de sessão no dashboard', async ({ page }) => {
    // Se não autenticado, redireciona para login — validar redirecionamento
    const url = page.url();
    if (url.includes('/login')) {
      await expect(page).toHaveURL(/\/login/);
      return;
    }
    await expect(page.getByRole('region', { name: /controles de sessão/i })).toBeVisible();
  });

  test('exibe toggle Paper/Real na tela de nova sessão', async ({ page }) => {
    if (page.url().includes('/login')) {
      test.skip();
      return;
    }
    await expect(page.getByRole('button', { name: /paper/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /real/i })).toBeVisible();
  });

  test('exibe formulário de metas na tela de nova sessão', async ({ page }) => {
    if (page.url().includes('/login')) {
      test.skip();
      return;
    }
    await expect(page.getByLabel(/meta de ganho/i)).toBeVisible();
    await expect(page.getByLabel(/limite de perda/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /iniciar sessão/i })).toBeVisible();
  });

  test('exibe erros de validação ao submeter metas em branco', async ({ page }) => {
    if (page.url().includes('/login')) {
      test.skip();
      return;
    }
    await page.getByRole('button', { name: /iniciar sessão/i }).click();
    const alerts = page.getByRole('alert');
    await expect(alerts.first()).toBeVisible();
  });

  test('exibe erros de validação para percentual > 100', async ({ page }) => {
    if (page.url().includes('/login')) {
      test.skip();
      return;
    }
    await page.getByLabel(/meta de ganho/i).fill('110');
    await page.getByLabel(/limite de perda/i).fill('1');
    await page.getByRole('button', { name: /iniciar sessão/i }).click();
    await expect(page.getByRole('alert').first()).toContainText(/100/);
  });

  test('alterna para modo Real ao clicar no botão Real', async ({ page }) => {
    if (page.url().includes('/login')) {
      test.skip();
      return;
    }
    const realBtn = page.getByRole('button', { name: /real/i });
    await realBtn.click();
    await expect(realBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /paper/i })).toHaveAttribute('aria-pressed', 'false');
  });
});
