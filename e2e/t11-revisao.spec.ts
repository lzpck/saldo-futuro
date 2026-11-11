import { expect, test, type Page } from "@playwright/test";

// Continua do estado das fatias anteriores (conta Nubank). Cria um cartão próprio e duas compras repetidas
// de 60 e 45 dias atrás: caem sempre em faturas já fechadas, qualquer que seja o dia de hoje.
const SENHA = "senha-de-teste-123";
const CARTAO = "Cartão t11";

test.describe.configure({ mode: "serial" });

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const diasAtras = (n: number) => iso(new Date(Date.now() - n * 86_400_000));

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

async function compra(page: Page, descricao: string, valor: string, data: string) {
  await page.goto("/lancamentos/novo");
  await page.getByLabel("Conta", { exact: true }).selectOption({ label: CARTAO });
  await page.getByLabel("Valor").fill(valor);
  await page.getByLabel("Descrição").fill(descricao);
  await page.getByLabel("Data").fill(data);
  await page.getByRole("button", { name: "Adicionar lançamento" }).click();
  await page.waitForURL(/lancamentos\?/);
}

const linha = (page: Page) => page.locator("li", { hasText: "Padaria t11" });

test("os repetidos viram uma linha só, com total e quantidade", async ({ page }) => {
  await entrar(page);
  await page.goto("/contas/nova?tipo=cartao");
  await page.getByLabel("Nome").fill(CARTAO);
  await page.getByLabel("Fecha no dia").fill("10");
  await page.getByLabel("Vence no dia").fill("20");
  await page.getByLabel("Paga a fatura com").selectOption({ label: "Nubank" });
  await page.getByRole("button", { name: "Salvar cartão" }).click();
  await page.waitForURL((u) => u.pathname === "/contas");

  await compra(page, "Padaria t11", "10,00", diasAtras(60));
  await compra(page, "PADARIA T11", "15,00", diasAtras(45));

  await page.goto("/revisao");
  await expect(page.getByRole("link", { name: "Revisão de gastos" }).first()).toBeVisible();
  await expect(linha(page)).toHaveCount(1);
  await expect(linha(page)).toContainText("R$ 25,00");
  await expect(linha(page)).toContainText("2 vezes");
});

test("um toque classifica, soma no topo, persiste; outro toque desmarca", async ({ page }) => {
  await entrar(page);
  await page.goto("/revisao");
  await expect(page.getByTestId("total-dispensavel")).toContainText("R$ 0,00");

  await linha(page).getByRole("button", { name: "Dispensável" }).click();
  await expect(page.getByTestId("total-dispensavel")).toContainText("R$ 25,00");
  await expect(page.getByTestId("progresso")).toContainText(/^1 de /);

  await page.reload();
  await expect(linha(page).getByRole("button", { name: "Dispensável" })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/revisao?nivel=sem");
  await expect(linha(page)).toHaveCount(0);
  await page.goto("/revisao?nivel=dispensavel");
  await expect(linha(page)).toHaveCount(1);

  await linha(page).getByRole("button", { name: "Dispensável" }).click();
  await expect(page.getByTestId("total-dispensavel")).toContainText("R$ 0,00");
  await expect(page.getByText("Nada neste filtro.")).toBeVisible();
});

test("a rota antiga /orcamento não existe mais e no celular não há rolagem horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await entrar(page);
  expect((await page.goto("/orcamento"))?.status()).toBe(404);
  await page.goto("/revisao");
  await expect(linha(page)).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
