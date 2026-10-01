import { expect, test, type Page } from "@playwright/test";

// Continua do estado das fatias anteriores. Usa descrições com "t06c" para não depender do que os outros specs lançaram.
const SENHA = "senha-de-teste-123";

test.describe.configure({ mode: "serial" });

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const HOJE = iso(new Date());

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

async function lancar(page: Page, o: { descricao: string; valor: string; receita?: boolean }) {
  await page.goto("/lancamentos/novo");
  if (o.receita) await page.getByText("Receita", { exact: true }).click();
  await page.getByLabel("Valor").fill(o.valor);
  await page.getByLabel("Descrição").fill(o.descricao);
  await page.getByLabel("Data").fill(HOJE);
  await page.getByRole("button", { name: "Adicionar lançamento" }).click();
  await page.waitForURL(/lancamentos\?/);
}

const buscar = async (page: Page, query: string) => {
  await page.goto(`/lancamentos?${query}`);
};
const linhas = (page: Page) => page.locator("li", { hasText: "t06c" });

test("busca ignora maiúsculas e acentos", async ({ page }) => {
  await entrar(page);
  await lancar(page, { descricao: "Café t06c", valor: "12,50" });
  await lancar(page, { descricao: "CAFÉ grande t06c", valor: "30,00" });
  await lancar(page, { descricao: "Salário t06c", valor: "5.000,00", receita: true });

  await buscar(page, "q=cafe");
  await expect(linhas(page)).toHaveCount(2);
  await buscar(page, "q=CAF%C3%89");
  await expect(linhas(page)).toHaveCount(2);

  await buscar(page, "q=t06c");
  await expect(page.getByLabel("Totais da busca")).toContainText("R$ 5.000,00");
  await expect(page.getByLabel("Totais da busca")).toContainText("R$ 42,50");
  // Resultados da busca não mostram saldo por dia.
  await expect(page.getByText("Saldo", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("separator")).toHaveCount(0);
});

test("filtros isolados e combinados", async ({ page }) => {
  await entrar(page);
  await buscar(page, "q=t06c&tipo=receita");
  await expect(linhas(page)).toHaveCount(1);
  await expect(linhas(page)).toContainText("Salário t06c");

  await buscar(page, "q=t06c&min=20,00&max=100,00");
  await expect(linhas(page)).toHaveCount(1);
  await expect(linhas(page)).toContainText("CAFÉ grande t06c");

  await buscar(page, `q=t06c&de=${HOJE}&ate=${HOJE}&tipo=despesa&situacao=efetivado`);
  await expect(linhas(page)).toHaveCount(2);

  await buscar(page, "q=t06c&situacao=atrasado");
  await expect(linhas(page)).toHaveCount(0);
  await expect(page.getByText("Nenhum lançamento encontrado.")).toBeVisible();
});

test("período invertido é corrigido com aviso", async ({ page }) => {
  await entrar(page);
  await buscar(page, `q=t06c&de=2099-01-01&ate=${HOJE}`);
  await expect(page.getByText("As datas estavam invertidas")).toBeVisible();
  await expect(linhas(page).first()).toBeVisible();
});

test("categoria pai traz as subcategorias", async ({ page }) => {
  await entrar(page);
  await page.goto("/categorias/nova");
  await page.getByLabel("Nome").fill("Pai t06c");
  await page.getByRole("button", { name: "Salvar categoria" }).click();
  await page.goto("/categorias/nova");
  await page.getByLabel("Nome").fill("Filha t06c");
  await page.getByLabel("Subcategoria de").selectOption({ label: "📦 Pai t06c" });
  await page.getByRole("button", { name: "Salvar categoria" }).click();

  await page.goto("/lancamentos/novo");
  await page.getByLabel("Valor").fill("9,99");
  await page.getByLabel("Descrição").fill("Gasto da filha t06c");
  await page.getByLabel("Data").fill(HOJE);
  await page.getByLabel("Categoria").selectOption({ label: "Filha t06c" });
  await page.getByRole("button", { name: "Adicionar lançamento" }).click();
  await page.waitForURL(/lancamentos\?/);

  await page.goto("/lancamentos");
  await page.getByText("Busca e filtros").click();
  await page.getByLabel("Filtrar por categoria").selectOption({ label: "Pai t06c" });
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByText("Gasto da filha t06c")).toBeVisible();
});

test("pagina de 50 em 50, o estado vai na URL e Limpar volta ao padrão", async ({ page }) => {
  await entrar(page);
  await page.goto("/lancamentos/novo?repeat=parcelado");
  await page.getByLabel("Valor de cada parcela").fill("7,77");
  await page.getByLabel("Descrição").fill("Parcelão t06c");
  await page.getByLabel("Nº de parcelas").fill("60");
  await page.getByLabel("Vencimento da 1ª parcela").fill(HOJE);
  await page.getByRole("button", { name: "Criar compra parcelada" }).click();
  await page.waitForURL(/lancamentos\?mes/);

  await buscar(page, "q=parcelão+t06c&ate=2040-12-31");
  await expect(page.getByText("60 resultados")).toBeVisible();
  await expect(linhas(page)).toHaveCount(50);
  await expect(page.getByText("Página 1 de 2")).toBeVisible();

  await page.getByRole("link", { name: "Próxima" }).click();
  await expect(page).toHaveURL(/pagina=2/);
  await expect(linhas(page)).toHaveCount(10);

  // Recarregar preserva busca e página.
  await page.reload();
  await expect(page.getByText("Página 2 de 2")).toBeVisible();
  // Com filtros ativos o formulário já abre expandido.
  await expect(page.getByLabel("Buscar na descrição")).toHaveValue("parcelão t06c");

  await page.getByRole("link", { name: "Limpar filtros" }).click();
  await expect(page).toHaveURL(/\/lancamentos$/);
  await expect(page.getByRole("link", { name: "Mês anterior" })).toBeVisible();
  await expect(page.getByLabel("Totais da busca")).toHaveCount(0);

  // Sem previstos, as parcelas futuras somem (só a de hoje, efetivada ou não, pode restar).
  await buscar(page, "q=parcelão+t06c&ate=2040-12-31&previstos=0");
  await expect(linhas(page).count()).resolves.toBeLessThanOrEqual(1);
});

test("a visão do mês continua com saldo por dia e, no celular, o formulário é recolhível", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await entrar(page);
  await page.goto("/lancamentos");
  await expect(page.getByRole("link", { name: "Mês anterior" })).toBeVisible();
  await expect(page.getByText("Saldo previsto no fim do mês")).toBeVisible();
  await expect(page.getByLabel("Buscar na descrição")).toBeHidden();
  await page.getByText("Busca e filtros").click();
  await expect(page.getByLabel("Buscar na descrição")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
