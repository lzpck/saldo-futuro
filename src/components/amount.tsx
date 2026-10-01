import { formatBRL } from "@/lib/money";

/** Valor em reais; `signed` colore e prefixa conforme o sinal. */
export function Amount({
  cents,
  signed = false,
  className = "",
}: {
  cents: number;
  signed?: boolean;
  className?: string;
}) {
  const color = !signed ? "" : cents > 0 ? "text-income" : cents < 0 ? "text-expense" : "";
  const prefix = signed && cents > 0 ? "+" : "";
  return (
    <span className={`${color} ${className}`}>
      {prefix}
      {formatBRL(cents)}
    </span>
  );
}
