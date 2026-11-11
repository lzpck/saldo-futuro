import { PageShell, PANEL } from "@/components/page-shell";

/** Bloco cinza pulsante; `motion-safe` respeita quem desliga animações no sistema. */
const Bone = ({ className }: { className: string }) => <div className={`rounded-md bg-surface-container-highest/60 motion-safe:animate-pulse ${className}`} />;

/** Esqueleto genérico das telas principais: cabeçalho, três cartões e uma lista. Cobre toda rota de `(app)` sem `loading.tsx` próprio. */
export default function Loading() {
  return (
    <PageShell>
      <div role="status" aria-busy="true" className="flex flex-col gap-6">
        <span className="sr-only">Carregando…</span>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Bone className="h-8 w-56" />
            <Bone className="h-4 w-40" />
          </div>
          <Bone className="h-10 w-40 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${PANEL} space-y-3`}>
              <Bone className="h-3 w-24" />
              <Bone className="h-8 w-36" />
              <Bone className="h-3 w-28" />
            </div>
          ))}
        </div>
        <div className={`${PANEL} space-y-3`}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Bone key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </PageShell>
  );
}
