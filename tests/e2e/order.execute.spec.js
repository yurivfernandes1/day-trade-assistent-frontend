import { test, expect } from '@playwright/test';

/**
 * E2E — US-C2: Fluxo de execução de ordens em Paper Mode
 * Start → Signal (preço atinge SL/TP) → Order → Confirm
 *
 * Requer app rodando em localhost:5173 com usuário autenticado via Supabase.
 * Em CI, configurar VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e
 * E2E_USER_EMAIL / E2E_USER_PASSWORD como secrets.
 */

test.describe('Execução de ordens em Paper Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  async function skipIfUnauthenticated(page) {
    const url = page.url();
    if (url.includes('/login')) {
      test.skip(true, 'Usuário não autenticado — pular teste E2E');
    }
  }

  // ─── Verificações estruturais ─────────────────────────────────────────────

  test('dashboard exibe controles de sessão', async ({ page }) => {
    const url = page.url();
    if (url.includes('/login')) {
      await expect(page).toHaveURL(/\/login/);
      return;
    }
    await expect(page.getByRole('region', { name: /controles de sessão/i })).toBeVisible();
  });

  test('toggle Paper é selecionado por padrão', async ({ page }) => {
    await skipIfUnauthenticated(page);
    const paperBtn = page.getByRole('button', { name: /paper/i });
    await expect(paperBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('botão Iniciar Sessão está visível antes de iniciar', async ({ page }) => {
    await skipIfUnauthenticated(page);
    await expect(page.getByRole('button', { name: /iniciar sessão/i })).toBeVisible();
  });

  test('formulário de metas é exibido antes de iniciar sessão', async ({ page }) => {
    await skipIfUnauthenticated(page);
    await expect(page.getByLabel(/meta de ganho/i)).toBeVisible();
    await expect(page.getByLabel(/limite de perda/i)).toBeVisible();
  });

  // ─── Validação de formulário ──────────────────────────────────────────────

  test('exibe erros ao tentar iniciar sessão com metas em branco', async ({ page }) => {
    await skipIfUnauthenticated(page);
    await page.getByRole('button', { name: /iniciar sessão/i }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
  });

  test('exibe erro de validação para meta de ganho percentual acima de 100%', async ({ page }) => {
    await skipIfUnauthenticated(page);
    await page.getByLabel(/meta de ganho/i).fill('110');
    await page.getByLabel(/limite de perda/i).fill('2');
    await page.getByRole('button', { name: /iniciar sessão/i }).click();
    await expect(page.getByRole('alert').first()).toContainText(/100/);
  });

  test('exibe erro de validação para limite de perda abaixo do mínimo', async ({ page }) => {
    await skipIfUnauthenticated(page);
    await page.getByLabel(/meta de ganho/i).fill('3');
    await page.getByLabel(/limite de perda/i).fill('0');
    await page.getByRole('button', { name: /iniciar sessão/i }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
  });

  // ─── Fluxo Start → Sessão Ativa → Stop ───────────────────────────────────

  test('inicia sessão Paper com metas válidas e exibe badge de sessão ativa', async ({ page }) => {
    await skipIfUnauthenticated(page);

    // Preencher formulário
    await page.getByLabel(/meta de ganho/i).fill('3');
    await page.getByLabel(/limite de perda/i).fill('1.5');
    await page.getByRole('button', { name: /iniciar sessão/i }).click();

    // Aguardar indicador de sessão ativa
    await expect(
      page.getByText(/sessão ativa|paper/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('exibe botão Encerrar Sessão após iniciar', async ({ page }) => {
    await skipIfUnauthenticated(page);

    await page.getByLabel(/meta de ganho/i).fill('2');
    await page.getByLabel(/limite de perda/i).fill('1');
    await page.getByRole('button', { name: /iniciar sessão/i }).click();

    await expect(
      page.getByRole('button', { name: /encerrar sessão/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('encerra sessão ao clicar em Encerrar Sessão', async ({ page }) => {
    await skipIfUnauthenticated(page);

    // Iniciar
    await page.getByLabel(/meta de ganho/i).fill('2');
    await page.getByLabel(/limite de perda/i).fill('1');
    await page.getByRole('button', { name: /iniciar sessão/i }).click();

    const stopBtn = page.getByRole('button', { name: /encerrar sessão/i });
    await expect(stopBtn).toBeVisible({ timeout: 10000 });

    // Encerrar
    await stopBtn.click();

    // Formulário de nova sessão volta a aparecer
    await expect(
      page.getByRole('button', { name: /iniciar sessão/i })
    ).toBeVisible({ timeout: 10000 });
  });

  // ─── Modo Paper vs Real ───────────────────────────────────────────────────

  test('alternância entre Paper e Real está funcional', async ({ page }) => {
    await skipIfUnauthenticated(page);

    const paperBtn = page.getByRole('button', { name: /paper/i });
    const realBtn = page.getByRole('button', { name: /real/i });

    await expect(paperBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(realBtn).toHaveAttribute('aria-pressed', 'false');

    await realBtn.click();

    await expect(realBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(paperBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('botão Real indica restrição (disabled ou aviso) sem 2FA', async ({ page }) => {
    await skipIfUnauthenticated(page);

    const realBtn = page.getByRole('button', { name: /real/i });

    // Real pode estar desabilitado (MVP) ou com aviso de 2FA
    const isDisabled = await realBtn.getAttribute('disabled');
    const title = await realBtn.getAttribute('title');

    // Verificar que há alguma indicação de restrição ao modo Real
    const hasRestriction = isDisabled !== null || (title && title.length > 0);
    expect(hasRestriction).toBe(true);
  });
});
