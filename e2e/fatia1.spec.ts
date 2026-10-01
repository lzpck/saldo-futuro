import { expect, test, type Page } from "@playwright/test";

const SENHA = "senha-de-teste-123";

test.describe.configure({ mode: "serial" });

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

test("exige login e cria a senha no primeiro acesso", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Primeiro acesso")).toBeVisible();

  await page.getByLabel("Nova senha").fill(SENHA);
  await page.getByLabel("Confirmar senha").fill("diferente");
  await page.getByRole("button", { name: "Criar senha e entrar" }).click();
  await expect(page.getByText("As senhas não conferem.")).toBeVisible();

  await page.getByLabel("Nova senha").fill(SENHA);
  await page.getByLabel("Confirmar senha").fill(SENHA);
  await page.getByRole("button", { name: "Criar senha e entrar" }).click();
  await expect(page.getByRole("heading", { name: "Bem-vindo ao Saldo Futuro" })).toBeVisible();
});

test("criar conta → lançar receita e despesa → saldo muda", async ({ page }) => {
  await entrar(page);

  await page.getByRole("link", { name: "Criar primeira conta" }).click();
  await page.getByLabel("Nome").fill("Nubank");
  await page.getByLabel("Saldo inicial").fill("1.000,00");
  await page.getByRole("button", { name: "Salvar conta" }).click();
  await expect(page.getByText("Saldo total")).toBeVisible();
  await expect(page.getByText("R$ 1.000,00").first()).toBeVisible();

  await page.goto("/lancamentos/novo");
  await page.getByText("Receita", { exact: true }).click();
  await page.getByLabel("Valor").fill("3.000,00");
  await page.getByLabel("Descrição").fill("Salário");
  await page.getByLabel("Categoria").selectOption({ label: "Salário" });
  await page.getByRole("button", { name: "Adicionar lançamento" }).click();
  await expect(page.locator("li", { hasText: "Salário" }).first()).toBeVisible();

  await page.goto("/lancamentos/novo");
  await page.getByLabel("Valor").fill("123,45");
  await page.getByLabel("Descrição").fill("Mercado do mês");
  await page.getByLabel("Categoria").selectOption({ label: "Mercado" });
  await page.getByRole("button", { name: "Adicionar lançamento" }).click();
  await expect(page.locator("li", { hasText: "Mercado do mês" })).toBeVisible();

  await page.goto("/");
  // 1.000,00 + 3.000,00 - 123,45
  await expect(page.getByText("R$ 3.876,55").first()).toBeVisible();
});

test("excluir lançamento devolve o saldo", async ({ page }) => {
  await entrar(page);

  await page.goto("/lancamentos");
  await page.getByRole("button", { name: "Excluir Mercado do mês" }).click();
  await expect(page.locator("li", { hasText: "Mercado do mês" })).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByText("R$ 4.000,00").first()).toBeVisible();
});

test("sair encerra a sessão e senha errada é recusada", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Senha").fill("errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Senha incorreta.")).toBeVisible();

  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Saldo total").first()).toBeVisible();

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/lancamentos");
  await expect(page).toHaveURL(/\/login$/);
});
