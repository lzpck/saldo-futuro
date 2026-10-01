"use server";

import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { refreshAll } from "./shared";
import { getDb } from "@/lib/db/connection";
import { idField, intField, parseCategoryForm, type FormState } from "@/lib/forms";
import { createCategory, setCategoryArchived, updateCategory } from "@/lib/repos/categories";

export async function saveCategory(_: FormState, fd: FormData): Promise<FormState> {
  await verifySession();
  const parsed = parseCategoryForm(fd);
  if (!parsed.ok) return { error: parsed.error };

  try {
    const id = intField(fd, "id");
    if (id) updateCategory(getDb(), id, parsed.data);
    else createCategory(getDb(), parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível salvar." };
  }

  refreshAll();
  redirect("/categorias");
}

export async function toggleCategoryArchived(fd: FormData): Promise<void> {
  await verifySession();
  setCategoryArchived(getDb(), idField(fd, "id"), fd.get("archive") === "1");
  refreshAll();
}
