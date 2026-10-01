import { expect, test, type Page } from "@playwright/test";

// Depende do estado deixado por fatia1.spec.ts (mesma senha; conta Nubank com R$ 4.000,00;
// salário lançado hoje). O Playwright roda os arquivos em ordem alfabética, com 1 worker.
const SENHA = "senha-de-teste-123";

test.describe.configure({ mode: "serial" });

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const offset = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return iso(d);
};
const YESTERDAY = offset(-1);
const TOMORROW = offset(1);

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

const saldoTotal = (page: Page) => page.getByText("Saldo total").locator("xpath=following-sibling::p[1]");

test("data futura sugere Previsto, e o usuário pode trocar", async ({ page }) => {
  await entrar(page);
  await page.goto("/lancamentos/novo");
  await expect(page.getByLabel("Já paguei")).toBeChecked();

  await page.getByLabel("Data").fill(TOMORROW);
  await expect(page.getByLabel("Vou pagar")).toBeChecked();
  await expect(page.getByText("ainda não muda o saldo atual")).toBeVisible();

  await page.getByLabel("Já paguei").check({ force: true });
  await page.getByLabel("Data").fill(offset(2));
  await expect(page.getByLabel("Já paguei")).toBeChecked(); // escolha manual é respeitada
});

test("previstos não mudam o saldo atual, mas entram na projeção por dia", async ({ page }) => {
  await entrar(page);

  // atrasado: venceu ontem, ainda não pago
  await page.goto("/lancamentos/novo");
  await page.getByLabel("Valor").fill("50,00");
  await page.getByLabel("Descrição").fill("Luz atrasada");
  await page.getByLabel("Data").fill(YESTERDAY);
  await page.getByLabel("Vou pagar").check({ force: true });
  await page.getByRole("button", { name: "Adicionar lançamento" }).click();
  await page.waitForURL(/lancamentos\?mes/);

  // futuro: vence amanhã
  await page.goto("/lancamentos/novo");
  await page.getByLabel("Valor").fill("100,00");
  await page.getByLabel("Descrição").fill("Internet");
  await page.getByLabel("Data").fill(TOMORROW);
  await page.getByRole("button", { name: "Adicionar lançamento" }).click();
  await page.waitForURL(/lancamentos\?mes/);

  await page.goto("/");
  await expect(saldoTotal(page)).toHaveText(/R\$\s4\.000,00/);

  // O atrasado pesa hoje (4.000 - 50), não na data original.
  await page.goto("/lancamentos");
  const hoje = page.locator("#hoje");
  await expect(hoje).toContainText("Luz atrasada");
  await expect(hoje).toContainText("Em atraso · 1 dia");
  await expect(hoje.locator("header")).toContainText(/R\$\s3\.950,00/);

  // O previsto de amanhã pesa só a partir do seu dia (3.950 - 100).
  await page.goto(`/lancamentos?mes=${TOMORROW.slice(0, 7)}`);
  const amanha = page.locator("section", { has: page.locator("li", { hasText: "Internet" }) });
  await expect(amanha.locator("header")).toContainText(/R\$\s3\.850,00/);
  await expect(page.getByText("Projeção", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /gráfico|Gráfico/ }).or(page.locator("figure svg"))).toBeVisible();
});

test("efetivar um atrasado mantém a data e atualiza o saldo atual", async ({ page }) => {
  await entrar(page);
  await page.goto("/lancamentos");
  await page.getByRole("button", { name: "Efetivar Luz atrasada" }).click();
  await expect(page.locator("#hoje")).not.toContainText("Em atraso");

  await page.goto("/");
  await expect(saldoTotal(page)).toHaveText(/R\$\s3\.950,00/);

  // A data original foi mantida: o lançamento continua em "ontem" no histórico do mês.
  await page.goto(`/lancamentos?mes=${YESTERDAY.slice(0, 7)}`);
  await expect(page.locator("li", { hasText: "Luz atrasada" })).toContainText(
    YESTERDAY.split("-").reverse().join("/"),
  );
});
