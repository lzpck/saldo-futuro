"use client";

/** Botão flutuante que leva ao topo da página. */
export function ScrollToTop({ className }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Voltar ao topo"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={className}
    >
      <span className="material-symbols-outlined text-2xl">keyboard_arrow_up</span>
    </button>
  );
}
