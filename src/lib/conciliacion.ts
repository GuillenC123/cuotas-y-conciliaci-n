// Lógica de conciliación: estado de cuenta bancario vs padrón de unidades
import Papa from "papaparse";
import type { Movimiento, ReglaMatch, ReportePago, Unidad, EstadoMovimiento, Lote } from "./types";
import { normalizar, periodoDe, uid } from "./util";

export interface FilaBanco {
  linea: number;
  fecha: string;
  descripcion: string;
  monto: number;
  operacion: string;
}

export interface ResultadoParseo {
  filas: FilaBanco[];
  errores: string[];
  cargosIgnorados: number;
}

const ALIAS: Record<keyof Omit<FilaBanco, "linea">, string[]> = {
  fecha: ["fecha", "fecha operacion", "fecha de operacion", "f operacion", "fecha valor"],
  descripcion: ["descripcion", "concepto", "detalle", "glosa", "descripcion operacion"],
  monto: ["monto", "importe", "abono", "monto s", "importe s"],
  operacion: ["operacion", "nro operacion", "n operacion", "numero operacion", "num operacion", "referencia", "nro de operacion", "codigo operacion"],
};

function claveColumna(h: string): string {
  return normalizar(h).toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

export function parsearFecha(v: string): string | null {
  const s = (v || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valida(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return valida(y, +m[2], +m[1]);
  }
  return null;
}

function valida(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getMonth() !== mo - 1) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parsearMonto(v: string): number | null {
  let s = (v || "").replace(/S\/\.?|PEN|\s/gi, "");
  if (!s) return null;
  // formato 1.234,50 -> 1234.50
  if (/^-?\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function parsearEstadoCuenta(texto: string): ResultadoParseo {
  const errores: string[] = [];
  if (!texto || !texto.trim()) return { filas: [], errores: ["El archivo está vacío."], cargosIgnorados: 0 };

  const res = Papa.parse<Record<string, string>>(texto.trim(), {
    header: true,
    skipEmptyLines: true,
    delimitersToGuess: [",", ";", "\t", "|"],
  });
  const headers = res.meta.fields || [];
  const mapa: Partial<Record<keyof Omit<FilaBanco, "linea">, string>> = {};
  for (const h of headers) {
    const k = claveColumna(h);
    for (const [campo, alias] of Object.entries(ALIAS)) {
      if (!mapa[campo as keyof typeof mapa] && alias.includes(k)) mapa[campo as keyof typeof mapa] = h;
    }
  }
  const faltan = (["fecha", "descripcion", "monto", "operacion"] as const).filter((c) => !mapa[c]);
  if (faltan.length) {
    return {
      filas: [],
      errores: [`Faltan columnas obligatorias: ${faltan.join(", ")}. Columnas encontradas: ${headers.join(", ") || "ninguna"}.`],
      cargosIgnorados: 0,
    };
  }

  const filas: FilaBanco[] = [];
  let cargosIgnorados = 0;
  res.data.forEach((row, i) => {
    const linea = i + 2;
    const fecha = parsearFecha(row[mapa.fecha!]);
    const monto = parsearMonto(row[mapa.monto!]);
    const operacion = (row[mapa.operacion!] || "").trim();
    const descripcion = (row[mapa.descripcion!] || "").trim();
    if (!fecha) return errores.push(`Línea ${linea}: fecha inválida ("${row[mapa.fecha!] ?? ""}").`);
    if (monto === null) return errores.push(`Línea ${linea}: monto inválido ("${row[mapa.monto!] ?? ""}").`);
    if (monto <= 0) {
      cargosIgnorados++;
      return;
    }
    if (!operacion) return errores.push(`Línea ${linea}: falta el número de operación.`);
    filas.push({ linea, fecha, descripcion, monto, operacion });
  });
  if (!filas.length && !errores.length) errores.push("No se encontraron abonos en el archivo.");
  return { filas, errores, cargosIgnorados };
}

// --- Identificación de la unidad ---

function variantesCodigo(codigo: string): string[] {
  const c = normalizar(codigo);
  const m = c.match(/^([A-Z]+)\s*-?\s*(\d+)$/);
  if (m) return [`${m[1]}-${m[2]}`, `${m[1]}${m[2]}`, `${m[1]} ${m[2]}`, `${m[2]}${m[1]}`, `${m[2]} ${m[1]}`, `${m[2]}-${m[1]}`];
  return [c];
}

export function buscarPorCodigo(desc: string, unidades: Unidad[]): Unidad | null {
  const d = ` ${normalizar(desc)} `;
  const hits = unidades.filter((u) =>
    variantesCodigo(u.codigo).some((v) => new RegExp(`[^A-Z0-9]${v.replace(/[-]/g, "\\-")}[^A-Z0-9]`).test(d))
  );
  return hits.length === 1 ? hits[0] : null;
}

const STOP = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y", "SAN", "SANTA"]);

export function buscarPorNombre(desc: string, unidades: Unidad[]): Unidad | null {
  const palabras = new Set(normalizar(desc).split(" "));
  let mejor: Unidad | null = null;
  let mejorScore = 0;
  let empate = false;
  for (const u of unidades) {
    const tokens = normalizar(u.propietario)
      .split(" ")
      .filter((t) => t.length >= 3 && !STOP.has(t));
    const score = tokens.filter((t) => palabras.has(t)).length;
    if (score > mejorScore) {
      mejor = u;
      mejorScore = score;
      empate = false;
    } else if (score === mejorScore && score > 0) empate = true;
  }
  return mejorScore >= 2 && !empate ? mejor : null;
}

function estadoPorMonto(monto: number, cuota: number): EstadoMovimiento {
  if (Math.abs(monto - cuota) < 0.01) return "conciliado";
  return monto < cuota ? "parcial" : "excedente";
}

export interface ResultadoConciliacion {
  movimientos: Movimiento[];
  reportesVerificados: string[];
  lote: Lote;
}

export function conciliar(
  filas: FilaBanco[],
  unidades: Unidad[],
  existentes: Movimiento[],
  reportes: ReportePago[],
  archivo: string,
  ignorados: number
): ResultadoConciliacion {
  const t0 = performance.now();
  const loteId = uid("L");
  const activas = unidades.filter((u) => u.activa);
  const vistas = new Set(existentes.map((m) => m.operacion.trim()));
  const pendientes = reportes.filter((r) => r.estado === "pendiente");
  const reportesVerificados: string[] = [];
  const ahora = new Date().toISOString();

  const movimientos: Movimiento[] = filas.map((f) => {
    const base = {
      id: uid("M"),
      fecha: f.fecha,
      descripcion: f.descripcion,
      monto: f.monto,
      operacion: f.operacion,
      periodo: periodoDe(f.fecha),
      loteId,
      creadoEn: ahora,
    };
    if (vistas.has(f.operacion)) {
      return { ...base, unidadId: null, estado: "duplicado" as const, regla: null };
    }
    vistas.add(f.operacion);

    let unidad: Unidad | null = null;
    let regla: ReglaMatch = null;
    const rep = pendientes.find((r) => r.operacion.trim() === f.operacion && !reportesVerificados.includes(r.id));
    if (rep) {
      unidad = activas.find((u) => u.id === rep.unidadId) || null;
      if (unidad) {
        regla = "reporte";
        reportesVerificados.push(rep.id);
      }
    }
    if (!unidad) {
      unidad = buscarPorCodigo(f.descripcion, activas);
      if (unidad) regla = "codigo";
    }
    if (!unidad) {
      unidad = buscarPorNombre(f.descripcion, activas);
      if (unidad) regla = "nombre";
    }
    if (!unidad) return { ...base, unidadId: null, estado: "revisar" as const, regla: null };
    return { ...base, unidadId: unidad.id, estado: estadoPorMonto(f.monto, unidad.cuota), regla };
  });

  const ms = Math.max(1, Math.round(performance.now() - t0));
  const lote: Lote = {
    id: loteId,
    archivo,
    fecha: ahora,
    filas: movimientos.length,
    automaticos: movimientos.filter((m) => m.unidadId).length,
    revisar: movimientos.filter((m) => m.estado === "revisar").length,
    duplicados: movimientos.filter((m) => m.estado === "duplicado").length,
    ignorados,
    ms,
  };
  return { movimientos, reportesVerificados, lote };
}

export function asignarManual(m: Movimiento, u: Unidad): Movimiento {
  return { ...m, unidadId: u.id, regla: "manual", estado: estadoPorMonto(m.monto, u.cuota) };
}
