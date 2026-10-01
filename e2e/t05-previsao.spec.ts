import { expect, test, type Page } from "@playwright/test";
import { addMonthsClamped } from "../src/lib/recurrence";
import { shiftMonth } from "../src/lib/prediction";
import { parseBRL } from "../src/lib/money";

// Continua do estado das fatias anteriores. Os valores são relativos ao dia da execução: o histórico
// inicial usa os 3 meses anteriores ao atual e a conta vence amanhã.
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

const LUZ = offset(1);
const THIS_MONTH = month(offset(0));

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

const saldoTotal = (page: Page) => page.getByText("Saldo total").locator("xpath=following-sibling::p[1]");
async function total(page: Page): Promise<number> {
  await page.goto("/");
  return parseBRL((await saldoTotal(page).innerText()).replace(/\s/g, " "))!;
}
const row = (page: Page, text: string) => page.locator("li", { hasText: text });

let before = 0;

test("criar luz variável com 3 meses de histórico: a ocorrência mostra o valor previsto e a explicação", async ({ page }) => {
  await entrar(page);
  before = await total(page);

  await page.goto("/lancamentos/novo?repeat=recorrente");
  await page.getByLabel("O valor muda todo mês").check();
  await expect(page.getByLabel(/^Valor estimado/)).toBeVisible();
  await page.getByLabel(/^Valor estimado/).fill("150,00");
  await page.getByLabel("Descrição").fill("Luz t05");
  await page.getByLabel("Primeira data").fill(LUZ);

  const seed = [100, 200, 300];
  for (const [i, valor] of seed.entries()) {
    await page.getByLabel(`Mês do histórico ${i + 1}`).fill(shiftMonth(THIS_MONTH, i - 3));
    await page.getByLabel(`Valor do histórico ${i + 1}`).fill(`${valor},00`);
  }
  await page.getByRole("button", { name: "Criar recorrência" }).click();
  await page.waitForURL(/lancamentos\?mes/);

  // (100*1 + 200*2 + 300*3) / 6 = 233,33
  const linha = row(page, "Luz t05");
  await expect(linha).toContainText(/R\$\s233,33/);
  await expect(linha).toContainText("Estimado");
  await expect(linha.getByText("Estimado")).toHaveAttribute("title", /3 meses/);
  expect(await total(page)).toBe(before); // o histórico não cria lançamentos nem mexe no saldo
});

test("a estimativa entra na projeção e aparece na agenda e na página da recorrência", async ({ page }) => {
  await entrar(page);
  await page.goto("/agenda");
  const card = page.getByRole("link", { name: /Luz t05/ });
  await expect(card).toContainText("Variável");
  await expect(card).toContainText(/≈\s*-?R\$\s233,33/);

  await card.click();
  await expect(page.getByText(/média ponderada dos últimos 3 meses/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Últimos 12 meses" })).toBeVisible();
});

test("Paguei leva à página da ocorrência com a estimativa pré-preenchida, sem pagar em silêncio", async ({ page }) => {
  await entrar(page);
  await page.goto(`/lancamentos?mes=${month(LUZ)}`);
  await row(page, "Luz t05").getByRole("link", { name: "Efetivar Luz t05" }).click();

  await expect(page.getByRole("heading", { name: "Informar valor pago" })).toBeVisible();
  await expect(page.getByLabel("Valor", { exact: true })).toHaveValue("233,33");
  await expect(page.getByLabel("Valor", { exact: true })).toBeFocused();
  expect(await total(page)).toBe(before); // nada foi pago ainda
});

test("efetivar com o valor real grava esse valor e a previsão do mês seguinte o considera", async ({ page }) => {
  await entrar(page);
  await page.goto(`/agenda/ocorrencia/${await luzRecurrenceId(page)}/${LUZ}?pago=1`);
  await page.getByLabel("Valor", { exact: true }).fill("400,00");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await page.waitForURL(/lancamentos\?mes/);
  await expect(row(page, "Luz t05")).toContainText(/R\$\s400,00/);
  expect(await total(page)).toBe(before - 40_000);

  // (100*1 + 200*2 + 300*3 + 400*4) / 10 = 300,00
  await page.goto(`/lancamentos?mes=${month(addMonthsClamped(LUZ, 1))}`);
  const proxima = row(page, "Luz t05");
  await expect(proxima).toContainText(/R\$\s300,00/);
  await expect(proxima.getByText("Estimado")).toHaveAttribute("title", /4 meses/);
});

async function luzRecurrenceId(page: Page): Promise<string> {
  await page.goto("/agenda");
  const href = await page.getByRole("link", { name: /Luz t05/ }).getAttribute("href");
  return href!.split("/").pop()!;
}
