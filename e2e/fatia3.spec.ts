import { expect, test, type Page } from "@playwright/test";
import { addMonthsClamped } from "../src/lib/recurrence";

// Continua do estado deixado por fatia1 e fatia2: conta Nubank com saldo total R$ 3.950,00 e a
// despesa "Internet" (R$ 100,00) prevista para amanhã.
const SENHA = "senha-de-teste-123";

test.describe.configure({ mode: "serial" });

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const offset = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return iso(d);
};
const month = (date: string) => date.slice(0, 7);
const brDate = (date: string) => date.split("-").reverse().join("/");

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

const saldoTotal = (page: Page) => page.getByText("Saldo total").locator("xpath=following-sibling::p[1]");
const emAberto = (page: Page) => page.getByRole("region", { name: "Contas em aberto" });
const row = (page: Page, text: string) => page.locator("li", { hasText: text });
const daySection = (page: Page, text: string) =>
  page.locator("section", { has: page.locator("li", { hasText: text }) });

const ALUGUEL = offset(2);
const STREAMING = offset(3);

test("criar recorrência mensal: entra na projeção e no painel, sem mexer no saldo atual", async ({ page }) => {
  await entrar(page);
  await page.goto("/lancamentos/novo?repeat=recorrente");
  await expect(page.getByRole("heading", { name: "Nova recorrência" })).toBeVisible();
  await page.getByLabel("Valor", { exact: true }).fill("1.500,00");
  await page.getByLabel("Descrição").fill("Aluguel teste");
  await page.getByLabel("Primeira data").fill(ALUGUEL);
  await page.getByRole("button", { name: "Criar recorrência" }).click();
  await page.waitForURL(/lancamentos\?mes/);

  // A ocorrência aparece no dia, marcada como recorrente, e o saldo do dia já a desconta
  // (3.950 - 100 da Internet - 1.500).
  const dia = daySection(page, "Aluguel teste");
  await expect(dia.locator("header")).toContainText(/R\$\s2\.350,00/);
  await expect(row(page, "Aluguel teste")).toContainText("↻");

  // No mês seguinte vem a próxima ocorrência (2.350 - 1.500).
  const proximo = addMonthsClamped(ALUGUEL, 1);
  await page.goto(`/lancamentos?mes=${month(proximo)}`);
  await expect(daySection(page, "Aluguel teste").locator("header")).toContainText(/R\$\s850,00/);

  await page.goto("/");
  await expect(saldoTotal(page)).toHaveText(/R\$\s3\.950,00/);
  await expect(emAberto(page)).toContainText("Aluguel teste");
  await expect(emAberto(page)).toContainText("Próximos 14 dias");
});

test("efetivar a ocorrência de hoje em diante: vira lançamento real e a próxima continua", async ({ page }) => {
  await entrar(page);
  await page.goto("/");
  await emAberto(page).getByRole("button", { name: "Efetivar Aluguel teste" }).click();
  await expect(emAberto(page)).not.toContainText("Aluguel teste");
  await expect(saldoTotal(page)).toHaveText(/R\$\s2\.450,00/);

  // Não duplicou: no mês seguinte ainda há exatamente uma ocorrência virtual.
  await page.goto(`/lancamentos?mes=${month(addMonthsClamped(ALUGUEL, 1))}`);
  await expect(row(page, "Aluguel teste")).toHaveCount(1);
});

test("pular uma ocorrência só remove aquela", async ({ page }) => {
  await entrar(page);
  const proximo = addMonthsClamped(ALUGUEL, 1);
  await page.goto(`/lancamentos?mes=${month(proximo)}`);
  await page.getByRole("button", { name: "Pular Aluguel teste" }).click();
  await expect(row(page, "Aluguel teste")).toHaveCount(0);

  // O mês seguinte a esse ainda tem a dele.
  await page.goto(`/lancamentos?mes=${month(addMonthsClamped(ALUGUEL, 2))}`);
  await expect(row(page, "Aluguel teste")).toHaveCount(1);
});

test("editar uma ocorrência muda só ela", async ({ page }) => {
  await entrar(page);
  await page.goto("/lancamentos/novo?repeat=recorrente");
  await page.getByLabel("Valor", { exact: true }).fill("40,00");
  await page.getByLabel("Descrição").fill("Streaming teste");
  await page.getByLabel("Primeira data").fill(STREAMING);
  await page.getByRole("button", { name: "Criar recorrência" }).click();
  await page.waitForURL(/lancamentos\?mes/);

  await row(page, "Streaming teste").getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Editar ocorrência" })).toBeVisible();
  await page.getByLabel("Valor", { exact: true }).fill("55,00");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await page.waitForURL(/lancamentos\?mes/);
  await expect(row(page, "Streaming teste")).toContainText(/R\$\s55,00/);

  await page.goto(`/lancamentos?mes=${month(addMonthsClamped(STREAMING, 1))}`);
  await expect(row(page, "Streaming teste")).toContainText(/R\$\s40,00/);
});

test("alterar a recorrência a partir de uma ocorrência preserva as anteriores", async ({ page }) => {
  await entrar(page);
  await page.goto("/agenda");
  await page.getByRole("link", { name: /Streaming teste/ }).click();
  // Escolhe a segunda ocorrência (a do mês seguinte) como ponto de partida.
  await page.getByLabel("Alterar a partir de").selectOption(addMonthsClamped(STREAMING, 1));
  await page.getByLabel("Valor", { exact: true }).fill("70,00");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await page.waitForURL((u) => u.pathname === "/agenda");

  await page.goto(`/lancamentos?mes=${month(STREAMING)}`);
  await expect(row(page, "Streaming teste")).toContainText(/R\$\s55,00/); // a editada à mão continua
  await page.goto(`/lancamentos?mes=${month(addMonthsClamped(STREAMING, 1))}`);
  await expect(row(page, "Streaming teste")).toContainText(/R\$\s70,00/);
});

test("compra parcelada: cria as parcelas e permite cancelar o restante", async ({ page }) => {
  await entrar(page);
  await page.goto("/lancamentos/novo?repeat=parcelado");
  await page.getByLabel("Valor de cada parcela").fill("300,00");
  await page.getByLabel("Descrição").fill("Notebook teste");
  await page.getByLabel("Vencimento da 1ª parcela").fill(offset(5));
  await page.getByRole("button", { name: "Criar compra parcelada" }).click();
  await page.waitForURL(/lancamentos\?mes/);

  await page.goto("/agenda");
  const card = page.getByRole("link", { name: /Notebook teste/ });
  await expect(card).toContainText("0/6 pagas");
  await expect(card).toContainText(/R\$\s1\.800,00/);

  await card.click();
  await expect(row(page, "Notebook teste")).toHaveCount(6);
  await expect(row(page, "Notebook teste").first()).toContainText("1/6");

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cancelar o restante" }).click();
  await expect(row(page, "Notebook teste")).toHaveCount(0);

  await page.goto("/");
  await expect(saldoTotal(page)).toHaveText(/R\$\s2\.450,00/); // nada foi pago
});

test("quitar o restante efetiva as parcelas e muda o saldo atual", async ({ page }) => {
  await entrar(page);
  await page.goto("/lancamentos/novo?repeat=parcelado");
  await page.getByLabel("Valor informado").selectOption("total");
  await page.getByLabel("Valor total da compra").fill("100,01");
  await page.getByLabel("Nº de parcelas").fill("2");
  await page.getByLabel("Descrição").fill("Fone teste");
  await page.getByLabel("Vencimento da 1ª parcela").fill(offset(4));
  await page.getByRole("button", { name: "Criar compra parcelada" }).click();
  await page.waitForURL(/lancamentos\?mes/);

  await page.goto("/agenda");
  await page.getByRole("link", { name: /Fone teste/ }).click();
  // 100,01 em 2x: a sobra de centavos fica na primeira parcela.
  await expect(row(page, "Fone teste").first()).toContainText(/R\$\s50,01/);
  await expect(row(page, "Fone teste").nth(1)).toContainText(/R\$\s50,00/);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Quitar o restante" }).click();
  await expect(page.getByText("Quitar o restante")).toHaveCount(0);

  await page.goto("/");
  await expect(saldoTotal(page)).toHaveText(/R\$\s2\.349,99/); // 2.450,00 - 100,01
});

test("atrasadas e vencimentos próximos aparecem no painel do Resumo", async ({ page }) => {
  await entrar(page);
  await page.goto("/lancamentos/novo");
  await page.getByLabel("Valor", { exact: true }).fill("20,00");
  await page.getByLabel("Descrição").fill("Boleto antigo");
  await page.getByLabel("Data").fill(offset(-3));
  await page.getByLabel("Vou pagar").check({ force: true });
  await page.getByRole("button", { name: "Adicionar lançamento" }).click();
  await page.waitForURL(/lancamentos\?mes/);

  await page.goto("/");
  await expect(emAberto(page)).toContainText("Em atraso");
  await expect(emAberto(page).locator("li", { hasText: "Boleto antigo" })).toContainText("Em atraso · 3 dias");
  await expect(emAberto(page).locator("li", { hasText: "Internet" })).toBeVisible(); // amanhã, ainda do teste 2
  await expect(emAberto(page)).toContainText(brDate(offset(1)));

  await emAberto(page).getByRole("button", { name: "Efetivar Boleto antigo" }).click();
  await expect(emAberto(page)).not.toContainText("Boleto antigo");
});
