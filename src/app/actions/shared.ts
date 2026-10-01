import { revalidatePath } from "next/cache";

/** Qualquer mudança de dados afeta saldo, agenda e resumo: invalida tudo. */
export function refreshAll(): void {
  revalidatePath("/", "layout");
}
