import { expect, test, type Page } from "@playwright/test";
import { closingDateFor, dueDateFor } from "../src/lib/cards";
import { parseBRL } from "../src/lib/money";

// Continua do estado das fatias anteriores (conta Nubank com saldo). Os valores esperados são
// relativos: o teste mede o saldo total antes e depois, e calcula ciclo e vencimento com as
// mesmas regras puras (testadas à parte), então vale em qualquer dia do mês.
const SENHA = "senha-de-teste-123";

test.describe.configure({ mode: "serial" });

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TODAY = iso(new Date());
const TERMS = { closingDay: 20, dueDay: 28 };
const CLOSING = closingDateFor(TODAY, TERMS.closingDay);
const DUE = dueDateFor(CLOSING, TERMS);
const brDate = (date: string) => date.split("-").reverse().join("/");

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
const cartaoLink = (page: Page) => page.locator('a[href^="/cartoes/"]', { hasText: "Cartão teste" });
const row = (page: Page, text: string | RegExp) => page.locator("li", { hasText: text });
// Pagamentos de fatura já feitos aparecem como lançamentos efetivados; o que falta é a linha "Previsto".
const faturaPrevista = (page: Page) => row(page, "Fatura Cartão teste").filter({ hasText: "Previsto" });

let before = 0;

test("cadastrar o cartão com fechamento, vencimento e conta de pagamento", async ({ page }) => {
  await entrar(page);
  before = await total(page);

  await page.goto("/contas/nova?tipo=cartao");
  await expect(page.getByRole("heading", { name: "Novo cartão" })).toBeVisible();
  await expect(page.getByLabel("Saldo inicial")).toHaveCount(0); // cartão não tem saldo inicial
  await page.getByLabel("Nome").fill("Cartão teste");
  await page.getByLabel("Fecha no dia").fill(String(TERMS.closingDay));
  await page.getByLabel("Vence no dia").fill(String(TERMS.dueDay));
  await page.getByLabel("Paga a fatura com").selectOption({ label: "Nubank" });
  await page.getByRole("button", { name: "Salvar cartão" }).click();
  await page.waitForURL((u) => u.pathname === "/contas");

  await expect(page.getByRole("heading", { name: "Cartões de crédito" })).toBeVisible();
  await expect(cartaoLink(page)).toContainText("Nenhuma fatura em aberto");
  expect(await total(page)).toBe(before); // criar o cartão não mexe no saldo
});

test("compra no cartão não muda o saldo; entra na fatura do ciclo certo", async ({ page }) => {
  await entrar(page);
  await page.goto("/contas");
  await cartaoLink(page).click();
  await page.getByRole("link", { name: "+ Compra" }).click();

  await expect(page.getByLabel("Conta")).toHaveValue(/\d+/);
  await page.getByLabel("Valor").fill("250,00");
  await page.getByLabel("Descrição").fill("Mercado cartão");
  await page.getByLabel("Categoria").selectOption({ label: "Mercado" });
  await expect(page.getByText("Compra no cartão: entra na fatura do ciclo")).toBeVisible();
  await page.getByRole("button", { name: "Adicionar lançamento" }).click();
  await page.waitForURL(/lancamentos\?mes/);

  expect(await total(page)).toBe(before); // o dinheiro ainda não saiu

  // O cartão no Resumo mostra a fatura e o vencimento calculados.
  const tile = cartaoLink(page);
  await expect(tile).toContainText(/R\$\s250,00/);
  await expect(tile).toContainText(`fatura vence em ${brDate(DUE)}`);

  // A página do cartão mostra a fatura aberta com a compra.
  await tile.click();
  await expect(page.getByText("Em aberto nas faturas").locator("xpath=following-sibling::span[1]")).toHaveText(/R\$\s250,00/);
  const fatura = page.locator(`#fatura-${CLOSING}`);
  await expect(fatura).toContainText(`vence ${brDate(DUE)}`);
  await expect(fatura.locator("li", { hasText: "Mercado cartão" })).toBeVisible();
});

test("o pagamento da fatura aparece previsto no vencimento, debitando a conta de pagamento", async ({ page }) => {
  await entrar(page);
  await page.goto(`/lancamentos?mes=${DUE.slice(0, 7)}`);
  const pagamento = row(page, "Fatura Cartão teste");
  await expect(pagamento).toBeVisible();
  await expect(pagamento).toContainText(/R\$\s250,00/);
  await expect(pagamento).toContainText("Nubank → Cartão teste");
  await expect(pagamento).toContainText(brDate(DUE));
});

test("pagamento parcial abate a fatura e sai da conta", async ({ page }) => {
  await entrar(page);
  await page.goto("/contas");
  await cartaoLink(page).click();

  const fatura = page.locator(`#fatura-${CLOSING}`);
  await fatura.locator("input[name=amount]").fill("100,00");
  await fatura.getByRole("button", { name: "Pagar fatura" }).click();
  await expect(fatura).toContainText(/falta\s+R\$\s150,00/);

  expect(await total(page)).toBe(before - 10_000);
});

test("pagar o restante pelo botão da lista quita a fatura", async ({ page }) => {
  await entrar(page);
  await page.goto(`/lancamentos?mes=${DUE.slice(0, 7)}`);
  await expect(faturaPrevista(page)).toContainText(/R\$\s150,00/); // só o que falta
  await expect(row(page, "Fatura Cartão teste")).toHaveCount(2); // 100,00 já pago + 150,00 previsto
  await page.getByRole("button", { name: /Efetivar Fatura Cartão teste/ }).click();
  await expect(page.getByRole("button", { name: /Efetivar Fatura Cartão teste/ })).toHaveCount(0);

  expect(await total(page)).toBe(before - 25_000);

  await page.goto("/contas");
  await expect(cartaoLink(page)).toContainText("Nenhuma fatura em aberto");
});

test("compra nova num ciclo já pago gera um pagamento só da diferença", async ({ page }) => {
  await entrar(page);
  await page.goto("/contas");
  await cartaoLink(page).click();
  await page.getByRole("link", { name: "+ Compra" }).click();
  await page.getByLabel("Valor").fill("30,00");
  await page.getByLabel("Descrição").fill("Esquecida");
  await page.getByRole("button", { name: "Adicionar lançamento" }).click();
  await page.waitForURL(/lancamentos\?mes/);

  await page.goto(`/lancamentos?mes=${DUE.slice(0, 7)}`);
  await expect(faturaPrevista(page)).toContainText(/R\$\s30,00/);
});

test("cartão e conta comum não se convertem", async ({ page }) => {
  await entrar(page);
  await page.goto("/contas");
  await cartaoLink(page).click();
  await page.waitForURL(/\/cartoes\/\d+/);
  await page.getByRole("link", { name: "Editar" }).click();
  await expect(page.getByRole("heading", { name: "Editar cartão" })).toBeVisible();
  const tipos = await page.getByLabel("Tipo").locator("option").allTextContents();
  expect(tipos).toEqual(["Cartão de crédito"]);
});
