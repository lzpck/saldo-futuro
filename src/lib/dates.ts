// Datas de lançamento são strings "AAAA-MM-DD" (sem fuso), para evitar saltos de dia.

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function isISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** "2026-10" ± n meses. */
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function isYearMonth(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/** Primeiro e último dia do mês "AAAA-MM". */
export function monthBounds(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`;
}

/** Dias inteiros de `a` até `b` (positivo se `b` é depois). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** "Qui, 01 de out" */
export function formatDayHeader(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const text = new Date(y, m - 1, d)
    .toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })
    .replace(/\./g, "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
