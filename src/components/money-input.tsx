"use client";

import { useState, type ClipboardEvent, type InputHTMLAttributes } from "react";
import { formatMoneyField, maskMoney, parseBRL, pasteMoney } from "@/lib/money";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "value" | "defaultValue" | "onChange" | "onPaste"
> & {
  /** Valor inicial em texto pt-BR ("1234,56" ou "1.234,56"); vazio deixa o campo vazio. */
  defaultValue?: string;
  /** Texto do campo, quando o pai controla o estado (já mascarado). */
  value?: string;
  /** Chamado com o texto mascarado a cada mudança. */
  onValueChange?: (text: string) => void;
  /** Permite saldo negativo: a tecla "-" alterna o sinal. */
  allowNegative?: boolean;
  /** Classes do contêiner (largura); `className` vai para o input. */
  wrapperClassName?: string;
};

function initialText(text: string | undefined, allowNegative: boolean): string {
  if (!text) return "";
  const cents = parseBRL(text);
  if (cents !== null) return formatMoneyField(allowNegative ? cents : Math.abs(cents));
  return maskMoney(text, { allowNegative });
}

/** Campo de dinheiro: só dígitos, preenchidos da direita para a esquerda ("R$" fixo, "1.234,56"). */
export function MoneyInput({
  defaultValue,
  value,
  onValueChange,
  allowNegative = false,
  wrapperClassName = "",
  className = "input",
  ...rest
}: Props) {
  const [inner, setInner] = useState(() => initialText(defaultValue ?? value, allowNegative));
  const text = value ?? inner;

  function update(next: string) {
    setInner(next);
    onValueChange?.(next);
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    update(pasteMoney(e.clipboardData.getData("text"), { allowNegative }));
  }

  return (
    <div className={`relative ${wrapperClassName}`}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted"
      >
        R$
      </span>
      <input
        {...rest}
        type="text"
        inputMode={allowNegative ? "decimal" : "numeric"}
        autoComplete="off"
        value={text}
        onChange={(e) => update(maskMoney(e.target.value, { allowNegative }))}
        onPaste={onPaste}
        onBlur={(e) => {
          if (text === "-") update("");
          rest.onBlur?.(e);
        }}
        className={`${className} pl-10`}
      />
    </div>
  );
}
