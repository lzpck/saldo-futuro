import type { Db } from "../db/connection";

export type CategoryKind = "despesa" | "receita";

export type Category = {
  id: number;
  name: string;
  kind: CategoryKind;
  parentId: number | null;
  color: string;
  icon: string;
  archived: boolean;
};

type Row = {
  id: number;
  name: string;
  kind: CategoryKind;
  parent_id: number | null;
  color: string;
  icon: string;
  archived: number;
};

const toCategory = (r: Row): Category => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  parentId: r.parent_id,
  color: r.color,
  icon: r.icon,
  archived: r.archived === 1,
});

export function listCategories(db: Db, opts: { includeArchived?: boolean } = {}): Category[] {
  const where = opts.includeArchived ? "" : "WHERE archived = 0";
  return (
    db.prepare(`SELECT * FROM categories ${where} ORDER BY kind DESC, name`).all() as Row[]
  ).map(toCategory);
}

export function getCategory(db: Db, id: number): Category | undefined {
  const row = db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as Row | undefined;
  return row && toCategory(row);
}

export function createCategory(
  db: Db,
  input: { name: string; kind: CategoryKind; parentId: number | null; color: string; icon: string },
): number {
  if (input.parentId !== null) {
    const parent = getCategory(db, input.parentId);
    if (!parent) throw new Error("Categoria pai não existe.");
    if (parent.parentId !== null) throw new Error("Só há um nível de subcategoria.");
    if (parent.kind !== input.kind) throw new Error("Subcategoria deve ter o mesmo tipo da categoria pai.");
  }
  const { lastInsertRowid } = db
    .prepare("INSERT INTO categories (name, kind, parent_id, color, icon) VALUES (?, ?, ?, ?, ?)")
    .run(input.name, input.kind, input.parentId, input.color, input.icon);
  return Number(lastInsertRowid);
}

export function updateCategory(
  db: Db,
  id: number,
  input: { name: string; color: string; icon: string },
): void {
  db.prepare("UPDATE categories SET name = ?, color = ?, icon = ? WHERE id = ?").run(
    input.name,
    input.color,
    input.icon,
    id,
  );
}

/** Arquiva a categoria e suas subcategorias; lançamentos antigos continuam apontando para ela. */
export function setCategoryArchived(db: Db, id: number, archived: boolean): void {
  db.prepare("UPDATE categories SET archived = ? WHERE id = ? OR parent_id = ?").run(
    archived ? 1 : 0,
    id,
    id,
  );
}
