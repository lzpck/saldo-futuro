import { describe, expect, it } from "vitest";
import { dailyAllowance } from "./daily-allowance";
import { addDays, type DayBalance } from "./projection";

const today = "2026-11-10";
const series = (balances: number[]): DayBalance[] =>
  balances.map((endBalanceCents, n) => ({
    date: addDays(today, n),
    phase: n === 0 ? "hoje" : "futuro",
    endBalanceCents,
    byAccount: {},
  }));

describe("dailyAllowance (menor saldo até o fim do mês ÷ dias restantes)", () => {
  it("divide o menor saldo pelos dias do intervalo, contando hoje", () => {
    // 10 a 14/11 (5 dias): o menor saldo é 5.000 no dia 13, não os 9.000 de hoje.
    const a = dailyAllowance(series([9_000, 7_000, 6_000, 5_000, 8_000]), "2026-11-14")!;
    expect(a).toMatchObject({ perDayCents: 1_000, lowestDate: "2026-11-13", lowestCents: 5_000, daysCount: 5 });
  });

  it("ignora o que vem depois do fim do mês", () => {
    const a = dailyAllowance(series([3_000, 3_000, -9_000]), "2026-11-11")!;
    expect(a.perDayCents).toBe(1_500);
  });

  it("arredonda para baixo, nunca promete centavo que não existe", () => {
    expect(dailyAllowance(series([1_000, 1_000, 1_000]), "2026-11-12")!.perDayCents).toBe(333);
  });

  it("zera quando o saldo projetado fica negativo ou zerado no caminho", () => {
    expect(dailyAllowance(series([5_000, -340, 2_000]), "2026-11-12")).toMatchObject({ perDayCents: 0, lowestCents: -340 });
    expect(dailyAllowance(series([5_000, 0]), "2026-11-11")!.perDayCents).toBe(0);
  });

  it("no último dia do mês, o intervalo é só hoje", () => {
    expect(dailyAllowance(series([4_000, 100]), today)).toMatchObject({ perDayCents: 4_000, daysCount: 1 });
  });

  it("sem dias no intervalo, devolve null", () => {
    expect(dailyAllowance([], today)).toBeNull();
  });
});
