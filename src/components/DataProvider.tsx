"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Config, DB, Egreso, Movimiento, ReportePago, Unidad } from "@/lib/types";
import { getRepo, modoPersistencia } from "@/lib/store";
import { dbDemo } from "@/lib/seed";
import { asignarManual, type ResultadoConciliacion } from "@/lib/conciliacion";
import { uid } from "@/lib/util";

export type Sesion = { rol: "admin" } | { rol: "vecino"; unidadId: string } | null;

interface Ctx {
  db: DB;
  cfg: Config;
  cargando: boolean;
  error: string | null;
  sesion: Sesion;
  modo: typeof modoPersistencia;
  loginAdmin(clave: string): boolean;
  loginVecino(codigo: string, pin: string): boolean;
  logout(): void;
  guardarUnidad(u: Unidad): Promise<void>;
  eliminarUnidad(id: string): Promise<void>;
  registrarConciliacion(r: ResultadoConciliacion): Promise<void>;
  asignar(movId: string, unidadId: string): Promise<void>;
  eliminarMovimientos(ids: string[]): Promise<void>;
  reportarPago(r: Omit<ReportePago, "id" | "estado" | "creadoEn">): Promise<void>;
  guardarEgreso(e: Egreso): Promise<void>;
  eliminarEgreso(id: string): Promise<void>;
  guardarConfig(c: Config): Promise<void>;
  reiniciarDemo(): Promise<void>;
  vaciarDatos(): Promise<void>;
}

const DataCtx = createContext<Ctx | null>(null);
const SES_KEY = "cuotas-vigilancia-sesion";

const vacia: DB = { config: null, unidades: [], movimientos: [], lotes: [], reportes: [], egresos: [] };

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(vacia);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sesion, setSesion] = useState<Sesion>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem(SES_KEY);
      if (s) setSesion(JSON.parse(s));
    } catch {}
    (async () => {
      try {
        const repo = getRepo();
        let data = await repo.cargar();
        if (!data.config) {
          data = dbDemo();
          await repo.reiniciar(data);
        }
        setDb(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo cargar la información.");
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const guardarSesion = (s: Sesion) => {
    setSesion(s);
    try {
      if (s) localStorage.setItem(SES_KEY, JSON.stringify(s));
      else localStorage.removeItem(SES_KEY);
    } catch {}
  };

  const ejecutar = useCallback(async (fn: () => Promise<void>) => {
    try {
      setError(null);
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ocurrió un error al guardar.";
      setError(msg);
      throw e;
    }
  }, []);

  const repo = getRepo();

  const value: Ctx = {
    db,
    cfg: db.config || dbDemo().config!,
    cargando,
    error,
    sesion,
    modo: modoPersistencia,
    loginAdmin(clave) {
      if (db.config && clave === db.config.claveAdmin) {
        guardarSesion({ rol: "admin" });
        return true;
      }
      return false;
    },
    loginVecino(codigo, pin) {
      const u = db.unidades.find((x) => x.codigo.toUpperCase() === codigo.trim().toUpperCase() && x.activa);
      if (u && u.pin === pin.trim()) {
        guardarSesion({ rol: "vecino", unidadId: u.id });
        return true;
      }
      return false;
    },
    logout() {
      guardarSesion(null);
    },
    guardarUnidad: (u) =>
      ejecutar(async () => {
        await repo.upsert("unidades", [u]);
        setDb((d) => ({ ...d, unidades: d.unidades.some((x) => x.id === u.id) ? d.unidades.map((x) => (x.id === u.id ? u : x)) : [...d.unidades, u] }));
      }),
    eliminarUnidad: (id) =>
      ejecutar(async () => {
        // No se borra el historial: la unidad se desactiva para mantener la trazabilidad
        const u = db.unidades.find((x) => x.id === id);
        if (!u) return;
        const nu = { ...u, activa: false };
        await repo.upsert("unidades", [nu]);
        setDb((d) => ({ ...d, unidades: d.unidades.map((x) => (x.id === id ? nu : x)) }));
      }),
    registrarConciliacion: (r) =>
      ejecutar(async () => {
        const reps = db.reportes.filter((x) => r.reportesVerificados.includes(x.id)).map((x) => ({ ...x, estado: "verificado" as const }));
        await repo.upsert("lotes", [r.lote]);
        await repo.upsert("movimientos", r.movimientos);
        if (reps.length) await repo.upsert("reportes", reps);
        setDb((d) => ({
          ...d,
          lotes: [...d.lotes, r.lote],
          movimientos: [...d.movimientos, ...r.movimientos],
          reportes: d.reportes.map((x) => reps.find((y) => y.id === x.id) || x),
        }));
      }),
    asignar: (movId, unidadId) =>
      ejecutar(async () => {
        const m = db.movimientos.find((x) => x.id === movId);
        const u = db.unidades.find((x) => x.id === unidadId);
        if (!m || !u) throw new Error("Movimiento o unidad no encontrada.");
        const nm: Movimiento = asignarManual(m, u);
        await repo.upsert("movimientos", [nm]);
        setDb((d) => ({ ...d, movimientos: d.movimientos.map((x) => (x.id === movId ? nm : x)) }));
      }),
    eliminarMovimientos: (ids) =>
      ejecutar(async () => {
        await repo.eliminar("movimientos", ids);
        setDb((d) => ({ ...d, movimientos: d.movimientos.filter((x) => !ids.includes(x.id)) }));
      }),
    reportarPago: (r) =>
      ejecutar(async () => {
        const nuevo: ReportePago = { ...r, id: uid("R"), estado: "pendiente", creadoEn: new Date().toISOString() };
        await repo.upsert("reportes", [nuevo]);
        setDb((d) => ({ ...d, reportes: [...d.reportes, nuevo] }));
      }),
    guardarEgreso: (e) =>
      ejecutar(async () => {
        await repo.upsert("egresos", [e]);
        setDb((d) => ({ ...d, egresos: d.egresos.some((x) => x.id === e.id) ? d.egresos.map((x) => (x.id === e.id ? e : x)) : [...d.egresos, e] }));
      }),
    eliminarEgreso: (id) =>
      ejecutar(async () => {
        await repo.eliminar("egresos", [id]);
        setDb((d) => ({ ...d, egresos: d.egresos.filter((x) => x.id !== id) }));
      }),
    guardarConfig: (c) =>
      ejecutar(async () => {
        await repo.upsert("config", [c]);
        setDb((d) => ({ ...d, config: c }));
      }),
    reiniciarDemo: () =>
      ejecutar(async () => {
        const data = dbDemo();
        await repo.reiniciar(data);
        setDb(data);
      }),
    vaciarDatos: () =>
      ejecutar(async () => {
        const c = { ...(db.config || dbDemo().config!), modoDemo: false };
        const data: DB = { ...vacia, config: c };
        await repo.reiniciar(data);
        setDb(data);
      }),
  };

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData() {
  const c = useContext(DataCtx);
  if (!c) throw new Error("useData fuera de DataProvider");
  return c;
}
