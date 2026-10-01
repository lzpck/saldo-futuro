import { expect, test, type Page } from "@playwright/test";

// Continua do estado das fatias anteriores. Usa uma categoria própria e o mês atual (o orçamento
// projeta previstos só de hoje em diante), com valores independentes do que os outros specs lançaram.
const SENHA = "senha-de-teste-123";
const CATEGORIA = "Orç t06b";

test.describe.configure({ mode: "serial" });

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const HOJE = iso(new Date());
const MES = HOJE.slice(0, 7);
const PROXIMO_MES = iso(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)).slice(0, 7);

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

async function despesa(page: Page, descricao: string, valor: string) {
  await page.goto("/lancamentos/novo");
  await page.getByLabel("Valor").fill(valor);
  await page.getByLabel("Descrição").fill(descricao);
  await page.getByLabel("Data").fill(HOJE);
  await page.getByLabel("Categoria").selectOption({ label: CATEGORIA });
  await page.getByRole("button", { name: "Adicionar lançamento" }).click();
  await page.waitForURL(/lancamentos\?/);
}

const bloco = (page: Page) => page.locator("li.card", { hasText: CATEGORIA });

test("definir o limite: vale no mês e nos seguintes, não nos anteriores", async ({ page }) => {
  await entrar(page);
  await page.goto("/categorias/nova");
  await page.getByLabel("Nome").fill(CATEGORIA);
  await page.getByRole("button", { name: "Salvar categoria" }).click();

  await page.goto(`/orcamento?mes=${MES}`);
  await bloco(page).getByLabel(`Limite de ${CATEGORIA}`).fill("100,00");
  await bloco(page).getByRole("button", { name: "Salvar" }).click();
  await expect(bloco(page)).toContainText("R$ 0,00 de R$ 100,00 · restam R$ 100,00");

  await page.goto(`/orcamento?mes=${PROXIMO_MES}`);
  await expect(bloco(page).getByLabel(`Limite de ${CATEGORIA}`)).toHaveValue("100,00");

  await page.goto(`/orcamento?mes=2020-01`);
  await expect(bloco(page).getByLabel(`Limite de ${CATEGORIA}`)).toHaveValue("");
  await expect(bloco(page)).toContainText("Sem limite definido");
});

test("gastar até estourar: atenção, aviso ao salvar e alerta no Resumo", async ({ page }) => {
  await entrar(page);

  await despesa(page, "Compra 1 t06b", "85,00");
  await expect(page.getByText("Orçamento estourado")).toHaveCount(0);
  await page.goto(`/orcamento?mes=${MES}`);
  await expect(bloco(page)).toContainText("R$ 85,00 de R$ 100,00 · restam R$ 15,00");
  await expect(bloco(page)).toContainText("Atenção");

  await despesa(page, "Compra 2 t06b", "20,00");
  await expect(page.getByRole("status")).toContainText(`Orçamento estourado em ${CATEGORIA}`);

  await page.goto(`/orcamento?mes=${MES}`);
  await expect(bloco(page)).toContainText("estourou em R$ 5,00");
  await expect(bloco(page).getByText("Estourou", { exact: false }).first()).toBeVisible();

  await page.goto("/");
  const resumo = page.getByRole("region", { name: "Orçamento do mês" });
  await expect(resumo).toContainText(CATEGORIA);
  await expect(resumo).toContainText("Estourou");
});

test("remover o limite (0) interrompe a herança sem mexer nos meses anteriores", async ({ page }) => {
  await entrar(page);
  await page.goto(`/orcamento?mes=${PROXIMO_MES}`);
  await bloco(page).getByLabel(`Limite de ${CATEGORIA}`).fill("0");
  await bloco(page).getByRole("button", { name: "Salvar" }).click();
  await expect(bloco(page)).toContainText("Sem limite definido");

  await page.goto(`/orcamento?mes=${MES}`);
  await expect(bloco(page).getByLabel(`Limite de ${CATEGORIA}`)).toHaveValue("100,00");
});

test("no celular não há rolagem horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await entrar(page);
  await page.goto(`/orcamento?mes=${MES}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // A barra inferior ganhou um item: confere que ele cabe sem estourar a largura.
  expect(await page.evaluate(() => [...document.querySelectorAll("nav")].every((n) => n.scrollWidth <= n.clientWidth))).toBe(true);
});
