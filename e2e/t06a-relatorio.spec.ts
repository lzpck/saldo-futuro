import { expect, test, type Page } from "@playwright/test";

// Continua do estado das fatias anteriores. Usa um mês fixo no passado, onde nada mais foi lançado.
const SENHA = "senha-de-teste-123";
const MES = "2025-03";

test.describe.configure({ mode: "serial" });

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

async function despesa(page: Page, descricao: string, valor: string, dia: string, categoria: string) {
  await page.goto("/lancamentos/novo");
  await page.getByLabel("Valor").fill(valor);
  await page.getByLabel("Descrição").fill(descricao);
  await page.getByLabel("Data").fill(`${MES}-${dia}`);
  await page.getByLabel("Categoria").selectOption({ label: categoria });
  await page.getByRole("button", { name: "Adicionar lançamento" }).click();
  await page.waitForURL(/lancamentos\?mes/);
}

test("mês sem lançamentos mostra estado vazio", async ({ page }) => {
  await entrar(page);
  await page.goto(`/relatorios?mes=${MES}`);
  await expect(page.getByText("Nenhuma despesa neste mês efetivada.")).toBeVisible();
});

test("despesas em categoria e subcategoria: valores, percentuais e detalhe na tabela", async ({ page }) => {
  await entrar(page);

  await page.goto("/categorias/nova");
  await page.getByLabel("Nome").fill("Casa t06");
  await page.getByRole("button", { name: "Salvar categoria" }).click();
  await page.goto("/categorias/nova");
  await page.getByLabel("Nome").fill("Luz t06");
  await page.getByLabel("Subcategoria de").selectOption({ label: "📦 Casa t06" });
  await page.getByRole("button", { name: "Salvar categoria" }).click();

  await despesa(page, "Mercado t06", "100,00", "05", "Mercado");
  await despesa(page, "Conta de luz t06", "30,00", "10", "Luz t06");
  await despesa(page, "Reparo t06", "20,00", "12", "Casa t06");

  await page.goto(`/relatorios?mes=${MES}`);
  const tabela = page.getByRole("table", { name: "Despesas por categoria" });
  const casa = tabela.locator("tr", { hasText: "Casa t06" });
  const mercado = tabela.locator("tr", { hasText: "Mercado" });
  await expect(mercado).toContainText("R$ 100,00");
  await expect(mercado).toContainText("66,7%");
  await expect(casa).toContainText("R$ 50,00"); // subcategoria soma no pai
  await expect(casa).toContainText("33,3%");
  await expect(tabela.locator("tfoot")).toContainText("R$ 150,00");

  await casa.getByRole("link", { name: /Casa t06/ }).click();
  const detalhe = page.getByRole("region").filter({ has: page.getByRole("heading", { name: /Casa t06/ }) });
  await expect(detalhe).toContainText("Luz t06");
  await expect(detalhe).toContainText("R$ 30,00");
  await expect(detalhe).toContainText("Outros de Casa t06");
  await expect(detalhe).toContainText("R$ 20,00");

  await detalhe.getByRole("link", { name: "Ver lançamentos" }).click();
  await expect(page).toHaveURL(/lancamentos\?mes=2025-03&categoria=\d+/);
  await expect(page.locator("li", { hasText: "Conta de luz t06" })).toBeVisible();
  await expect(page.locator("li", { hasText: "Reparo t06" })).toBeVisible();
  await expect(page.locator("li", { hasText: "Mercado t06" })).toHaveCount(0);
});

test("no celular não há rolagem horizontal e a aba Receitas não mistura despesas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await entrar(page);
  await page.goto(`/relatorios?mes=${MES}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("tab", { name: "Receitas" }).click();
  await expect(page.getByText("Nenhuma receita neste mês efetivada.")).toBeVisible();
});
