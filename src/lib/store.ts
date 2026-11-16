// Capa de persistencia: Supabase (PostgreSQL) si hay variables de entorno; si no, LocalStorage estructurado.
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { DB, Tabla } from "./types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const modoPersistencia: "supabase" | "local" = URL && KEY ? "supabase" : "local";

const TABLAS: Tabla[] = ["config", "unidades", "movimientos", "lotes", "reportes", "egresos"];

// --- conversión camelCase <-> snake_case para las columnas de PostgreSQL ---
const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const toCamel = (k: string) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
function mapKeys<T>(o: Record<string, unknown>, f: (k: string) => string): T {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [f(k), v])) as T;
}

export interface Repo {
  cargar(): Promise<DB>;
  upsert(tabla: Tabla, filas: object[]): Promise<void>;
  eliminar(tabla: Tabla, ids: string[]): Promise<void>;
  reiniciar(db: DB): Promise<void>;
}

const vacia = (): DB => ({ config: null, unidades: [], movimientos: [], lotes: [], reportes: [], egresos: [] });

// ---------------- LocalStorage ----------------
const LS_KEY = "cuotas-vigilancia-db-v2";

class LocalRepo implements Repo {
  private leer(): DB {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? { ...vacia(), ...JSON.parse(raw) } : vacia();
    } catch {
      return vacia();
    }
  }
  private guardar(db: DB) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(db));
    } catch (e) {
      console.error("No se pudo guardar en LocalStorage", e);
      throw new Error("No se pudo guardar los datos en este navegador.");
    }
  }
  async cargar() {
    return this.leer();
  }
  async upsert(tabla: Tabla, filas: object[]) {
    const db = this.leer();
    if (tabla === "config") {
      db.config = filas[0] as DB["config"];
    } else {
      const lista = db[tabla] as { id: string }[];
      for (const f of filas as { id: string }[]) {
        const i = lista.findIndex((x) => x.id === f.id);
        if (i >= 0) lista[i] = f;
        else lista.push(f);
      }
    }
    this.guardar(db);
  }
  async eliminar(tabla: Tabla, ids: string[]) {
    if (tabla === "config") return;
    const db = this.leer();
    (db[tabla] as { id: string }[]) = (db[tabla] as { id: string }[]).filter((x) => !ids.includes(x.id));
    this.guardar(db);
  }
  async reiniciar(db: DB) {
    this.guardar(db);
  }
}

// ---------------- Supabase ----------------
class SupabaseRepo implements Repo {
  private sb: SupabaseClient;
  constructor() {
    this.sb = createClient(URL!, KEY!);
  }
  private async todas(tabla: Tabla) {
    const out: Record<string, unknown>[] = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await this.sb.from(tabla).select("*").range(desde, desde + 999);
      if (error) throw new Error(`Error leyendo ${tabla}: ${error.message}`);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out.map((r) => mapKeys<Record<string, unknown>>(r, toCamel));
  }
  async cargar() {
    const [config, unidades, movimientos, lotes, reportes, egresos] = await Promise.all(TABLAS.map((t) => this.todas(t)));
    return {
      config: (config[0] as unknown as DB["config"]) || null,
      unidades: unidades as unknown as DB["unidades"],
      movimientos: movimientos as unknown as DB["movimientos"],
      lotes: lotes as unknown as DB["lotes"],
      reportes: reportes as unknown as DB["reportes"],
      egresos: egresos as unknown as DB["egresos"],
    };
  }
  async upsert(tabla: Tabla, filas: object[]) {
    if (!filas.length) return;
    for (let i = 0; i < filas.length; i += 500) {
      const chunk = filas.slice(i, i + 500).map((f) => mapKeys<Record<string, unknown>>(f as Record<string, unknown>, toSnake));
      const { error } = await this.sb.from(tabla).upsert(chunk);
      if (error) throw new Error(`Error guardando en ${tabla}: ${error.message}`);
    }
  }
  async eliminar(tabla: Tabla, ids: string[]) {
    if (!ids.length) return;
    const { error } = await this.sb.from(tabla).delete().in("id", ids);
    if (error) throw new Error(`Error eliminando en ${tabla}: ${error.message}`);
  }
  async reiniciar(db: DB) {
    for (const t of TABLAS) {
      const { error } = await this.sb.from(t).delete().neq("id", "__ninguno__");
      if (error) throw new Error(`Error limpiando ${t}: ${error.message}`);
    }
    if (db.config) await this.upsert("config", [db.config]);
    for (const t of TABLAS.filter((x) => x !== "config")) await this.upsert(t, db[t as Exclude<Tabla, "config">] as object[]);
  }
}

let repo: Repo | null = null;
export function getRepo(): Repo {
  if (!repo) repo = modoPersistencia === "supabase" ? new SupabaseRepo() : new LocalRepo();
  return repo;
}
