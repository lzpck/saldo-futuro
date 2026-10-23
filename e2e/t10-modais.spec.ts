import { expect, test, type Page } from "@playwright/test";

// Formulários de Conta e Categoria abrem em modal sobre a tela de origem; o acesso direto à URL mostra a página inteira.
const SENHA = "senha-de-teste-123";

test.describe.configure({ mode: "serial" });

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

test("nova categoria abre em modal, salva e fecha na lista", async ({ page }) => {
  await entrar(page);
  await page.goto("/categorias");
  await page.getByRole("link", { name: "Nova categoria" }).click();

  const modal = page.getByRole("dialog", { name: "Nova categoria" });
  await expect(modal).toBeVisible();
  await expect(page).toHaveURL(/\/categorias\/nova$/);

  await modal.getByLabel("Nome").fill("Modal t10");
  await modal.getByRole("button", { name: "Salvar categoria" }).click();

  await expect(modal).toBeHidden();
  await expect(page).toHaveURL(/\/categorias$/);
  await expect(page.getByText("Modal t10")).toBeVisible();
});

test("Esc fecha; clique no fundo só fecha se nada foi digitado", async ({ page }) => {
  await entrar(page);
  await page.goto("/categorias");
  await page.getByRole("link", { name: "Nova categoria" }).click();
  const modal = page.getByRole("dialog", { name: "Nova categoria" });
  await expect(modal).toBeVisible();

  await page.mouse.click(5, 5);
  await expect(modal).toBeHidden();

  await page.getByRole("link", { name: "Nova categoria" }).click();
  await expect(modal).toBeVisible();
  await modal.getByLabel("Nome").fill("Rascunho");
  await page.mouse.click(5, 5);
  await expect(modal).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await expect(page).toHaveURL(/\/categorias$/);
});

test("acesso direto à URL mostra a página inteira, sem modal", async ({ page }) => {
  await entrar(page);
  await page.goto("/categorias/nova");
  await expect(page.getByRole("heading", { name: "Nova categoria" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("conta: editar em modal e arquivar com confirmação", async ({ page }) => {
  await entrar(page);
  await page.goto("/contas");
  await page.getByRole("link", { name: "+ Conta", exact: true }).last().click();
  const novo = page.getByRole("dialog", { name: "Nova conta" });
  await novo.getByLabel("Nome").fill("Conta t10");
  await novo.getByLabel("Saldo inicial").fill("10,00");
  await novo.getByRole("button", { name: "Salvar conta" }).click();
  await expect(novo).toBeHidden();
  await expect(page).toHaveURL(/\/contas$/);

  const linha = page.locator("li", { hasText: "Conta t10" });
  await linha.getByRole("link", { name: "Editar" }).click();
  const edicao = page.getByRole("dialog", { name: "Editar conta" });
  await expect(edicao).toBeVisible();

  await edicao.getByRole("button", { name: "Arquivar conta" }).click();
  await page.getByRole("dialog", { name: "Arquivar conta" }).getByRole("button", { name: "Arquivar", exact: true }).click();

  await expect(edicao).toBeHidden();
  await expect(page).toHaveURL(/\/contas$/);
  await expect(page.locator("li", { hasText: "Conta t10" }).getByRole("link", { name: "Editar" })).toHaveCount(0);
});

test("lançamento: novo em modal volta à lista de origem e a edição também abre em modal", async ({ page }) => {
  await entrar(page);
  await page.goto("/lancamentos");
  await page.waitForLoadState("networkidle"); // o clique antes da hidratação não abre o modal
  await page.getByRole("link", { name: /Novo Lançamento/ }).click();

  const modal = page.getByRole("dialog", { name: "Novo lançamento" });
  await expect(modal).toBeVisible();
  await expect(page).toHaveURL(/\/lancamentos\/novo\?voltar=/);

  await modal.getByLabel("Valor").fill("12,34");
  await modal.getByLabel("Descrição").fill("Lanche t10");
  await modal.getByRole("button", { name: "Adicionar lançamento" }).click();

  await expect(modal).toBeHidden();
  await expect(page).toHaveURL(/\/lancamentos(\?|$)/);
  const linha = page.locator("li", { hasText: "Lanche t10" });
  await expect(linha).toBeVisible();

  await linha.getByRole("link", { name: /Lanche t10/ }).first().click();
  await expect(page.getByRole("dialog", { name: "Editar lançamento" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
