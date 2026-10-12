import { expect, test, type Page } from "@playwright/test";
import { closingDateFor, dueDateFor } from "../src/lib/cards";

// Tela de Contas: aviso de saldo projetado, resumo, cartão com limite e ajuste de saldo.
// Usa contas próprias, com valores independentes do que os outros specs deixaram.
const SENHA = "senha-de-teste-123";

test.describe.configure({ mode: "serial" });

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (n: number) => iso(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + n));
const HOJE = addDays(0);
// Fecha em 3 dias e vence em 10: a fatura cai sempre dentro do horizonte de 30 dias.
const TERMS = { closingDay: Number(addDays(3).slice(8)), dueDay: Number(addDays(10).slice(8)) };
const VENCIMENTO = dueDateFor(closingDateFor(HOJE, TERMS.closingDay), TERMS);
const brShort = (date: string) => date.split("-").reverse().join("/").slice(0, 5);

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

test("conta e cartão com limite: o saldo que não cobre a fatura vira aviso", async ({ page }) => {
  await entrar(page);

  await page.goto("/contas/nova");
  await page.getByLabel("Nome").fill("Conta t09");
  await page.getByLabel("Saldo inicial").fill("100,00");
  await page.getByRole("button", { name: "Salvar conta" }).click();
  await page.waitForURL((u) => u.pathname === "/contas");

  await page.goto("/contas/nova?tipo=cartao");
  await page.getByLabel("Nome").fill("Cartão t09");
  await page.getByLabel("Fecha no dia").fill(String(TERMS.closingDay));
  await page.getByLabel("Vence no dia").fill(String(TERMS.dueDay));
  await page.getByLabel("Paga a fatura com").selectOption({ label: "Conta t09" });
  await page.getByLabel("Limite").fill("5.000,00");
  await page.getByRole("button", { name: "Salvar cartão" }).click();
  await page.waitForURL((u) => u.pathname === "/contas");

  await page.goto("/lancamentos/novo");
  await page.getByLabel("Conta", { exact: true }).selectOption({ label: "Cartão t09" });
  await page.getByLabel("Valor").fill("300,00");
  await page.getByLabel("Descrição").fill("Compra t09");
  await page.getByRole("button", { name: "Adicionar lançamento" }).click();
  await page.waitForURL(/lancamentos\?/);

  await page.goto("/contas");
  await expect(page.getByRole("alert").filter({ hasText: "faltam" })).toContainText(
    new RegExp(`Conta t09: faltam R\\$\\s200,00 para cobrir as faturas até ${brShort(VENCIMENTO)}`),
  );
  const conta = page.locator("li", { hasText: "Conta t09" });
  await expect(conta).toContainText(/Após faturas:\s*-R\$\s200,00/);
  await expect(page.getByRole("heading", { name: "Contas correntes" })).toBeVisible();

  const cartao = page.locator('a[href^="/cartoes/"]', { hasText: "Cartão t09" });
  await expect(cartao).toContainText("Fatura atual");
  await expect(cartao).toContainText(/R\$\s300,00/);
  await expect(cartao).toContainText(`Vence em ${VENCIMENTO.split("-").reverse().join("/")}`);
  await expect(page.locator("li", { hasText: "Cartão t09" })).toContainText(/Limite R\$\s5\.000,00 · usado 6%/);
});

test("resumo traz Saldo total, Faturas e Patrimônio líquido", async ({ page }) => {
  await entrar(page);
  await page.goto("/contas");
  const resumo = page.getByRole("region", { name: "Resumo do patrimônio" });
  for (const rotulo of ["Saldo total", "Benefício", "Guardado", "Faturas", "Patrimônio líquido"]) {
    await expect(resumo.getByText(rotulo, { exact: true })).toBeVisible();
  }
});

test("a linha da conta abre o extrato filtrado e Ajustar saldo cria o lançamento de ajuste", async ({ page }) => {
  await entrar(page);
  await page.goto("/contas");
  await page.locator('a[href^="/lancamentos?conta="]', { hasText: "Conta t09" }).click();
  await expect(page).toHaveURL(/\/lancamentos\?conta=\d+/);

  await page.goto("/contas");
  await page.locator("li", { hasText: "Conta t09" }).getByRole("link", { name: "Ajustar saldo" }).click();
  await page.getByLabel("Saldo real no banco").fill("80,00");
  await page.getByRole("button", { name: "Ajustar saldo" }).click();
  await page.waitForURL((u) => u.pathname === "/contas");
  await expect(page.locator("li", { hasText: "Conta t09" })).toContainText(`conferido em ${brShort(HOJE)}`);

  await page.goto(`/lancamentos?conta=${await idDaConta(page)}`);
  await expect(page.locator("li", { hasText: "Ajuste de saldo" })).toContainText(/R\$\s20,00/);
});

async function idDaConta(page: Page): Promise<string> {
  await page.goto("/contas");
  const href = await page.locator('a[href^="/lancamentos?conta="]', { hasText: "Conta t09" }).getAttribute("href");
  return href!.split("=")[1];
}
