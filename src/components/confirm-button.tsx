"use client";

/** Botão de envio que pede confirmação antes de uma ação difícil de desfazer. */
export function ConfirmButton({
  message,
  className = "btn",
  children,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
