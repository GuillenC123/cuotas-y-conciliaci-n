// Cálculo de estado de cuenta por unidad, morosidad y reporte mensual
import type { Config, Egreso, Movimiento, Unidad } from "./types";
import { hoyISO, periodoActual, rangoPeriodos } from "./util";

const VALIDOS = new Set(["conciliado", "parcial", "excedente"]);

export interface EstadoPeriodo {
  periodo: string;
  cuota: number;
  pagado: number;
  estado: "pagado" | "parcial" | "pendiente" | "por_vencer";
  fechaPago: string | null;
  diasRetraso: number | null;
}

export function pagosValidos(movs: Movimiento[]): Movimiento[] {
  return movs.filter((m) => m.unidadId && VALIDOS.has(m.estado));
}

export function primerPeriodo(movs: Movimiento[]): string {
  const ps = pagosValidos(movs).map((m) => m.periodo).sort();
  return ps[0] || periodoActual();
}

function vencido(periodo: string, cfg: Config): boolean {
  const hoy = hoyISO();
  const actual = periodoActual();
  if (periodo < actual) return true;
  if (periodo > actual) return false;
  return Number(hoy.slice(8, 10)) > cfg.diaVencimiento;
}

export function diasRetraso(fecha: string, periodo: string, cfg: Config): number {
  const venc = new Date(`${periodo}-${String(cfg.diaVencimiento).padStart(2, "0")}T00:00:00`);
  const pago = new Date(`${fecha}T00:00:00`);
  return Math.max(0, Math.round((pago.getTime() - venc.getTime()) / 86400000));
}

// Cada pago se aplica primero al mes más antiguo que la unidad debe (aunque se haya pagado en otro mes).
// Lo que sobra después de cubrir el mes actual queda como saldo a favor.
export function aplicarPagos(u: Unidad, movs: Movimiento[], cfg: Config, desde: string): { periodos: EstadoPeriodo[]; saldoFavor: number } {
  const pagos = pagosValidos(movs)
    .filter((m) => m.unidadId === u.id)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
  const meses = rangoPeriodos(desde, periodoActual()).map((p) => ({ periodo: p, pagado: 0, fechaPago: null as string | null }));
  let saldoFavor = 0;
  for (const pago of pagos) {
    let resto = pago.monto;
    for (const mes of meses) {
      if (resto <= 0.005) break;
      const falta = u.cuota - mes.pagado;
      if (falta <= 0.005) continue;
      const aplica = Math.min(resto, falta);
      mes.pagado = Math.round((mes.pagado + aplica) * 100) / 100;
      mes.fechaPago = pago.fecha;
      resto -= aplica;
    }
    if (resto > 0.005) saldoFavor += resto;
  }
  const periodos = meses.map((mes) => {
    let estado: EstadoPeriodo["estado"];
    if (mes.pagado >= u.cuota - 0.01) estado = "pagado";
    else if (mes.pagado > 0) estado = "parcial";
    else estado = vencido(mes.periodo, cfg) ? "pendiente" : "por_vencer";
    return {
      periodo: mes.periodo,
      cuota: u.cuota,
      pagado: mes.pagado,
      estado,
      fechaPago: mes.fechaPago,
      diasRetraso: mes.fechaPago ? diasRetraso(mes.fechaPago, mes.periodo, cfg) : null,
    };
  });
  return { periodos, saldoFavor: Math.round(saldoFavor * 100) / 100 };
}

export function estadoUnidad(u: Unidad, movs: Movimiento[], cfg: Config, desde: string): EstadoPeriodo[] {
  return aplicarPagos(u, movs, cfg, desde).periodos;
}

export interface FilaMorosidad {
  unidad: Unidad;
  mesesDeuda: number;
  deuda: number;
  alDia: boolean;
  periodos: EstadoPeriodo[];
}

export function tablaMorosidad(unidades: Unidad[], movs: Movimiento[], cfg: Config): FilaMorosidad[] {
  const desde = primerPeriodo(movs);
  return unidades
    .filter((u) => u.activa)
    .map((u) => {
      const periodos = estadoUnidad(u, movs, cfg, desde);
      const deudas = periodos.filter((p) => p.estado === "pendiente" || p.estado === "parcial");
      const deuda = deudas.reduce((s, p) => s + Math.max(0, p.cuota - p.pagado), 0);
      return { unidad: u, mesesDeuda: deudas.length, deuda: Math.round(deuda * 100) / 100, alDia: deudas.length === 0, periodos };
    });
}

export interface ReporteMensual {
  periodo: string;
  ingresos: number;
  egresos: number;
  saldo: number;
  esperado: number;
  pagaron: number;
  totalUnidades: number;
  egresosPorCategoria: { categoria: string; monto: number }[];
}

export function reporteMensual(periodo: string, unidades: Unidad[], movs: Movimiento[], egresos: Egreso[]): ReporteMensual {
  const activas = unidades.filter((u) => u.activa);
  const ingresosMes = pagosValidos(movs).filter((m) => m.periodo === periodo);
  const ingresos = ingresosMes.reduce((s, m) => s + m.monto, 0);
  const egMes = egresos.filter((e) => e.fecha.slice(0, 7) === periodo);
  const egTotal = egMes.reduce((s, e) => s + e.monto, 0);
  const cat = new Map<string, number>();
  egMes.forEach((e) => cat.set(e.categoria, (cat.get(e.categoria) || 0) + e.monto));
  const pagaron = new Set(ingresosMes.map((m) => m.unidadId)).size;
  return {
    periodo,
    ingresos: Math.round(ingresos * 100) / 100,
    egresos: Math.round(egTotal * 100) / 100,
    saldo: Math.round((ingresos - egTotal) * 100) / 100,
    esperado: activas.reduce((s, u) => s + u.cuota, 0),
    pagaron,
    totalUnidades: activas.length,
    egresosPorCategoria: [...cat.entries()].map(([categoria, monto]) => ({ categoria, monto })).sort((a, b) => b.monto - a.monto),
  };
}

// Dataset para el APF3: una fila por unidad y periodo
export function datasetAPF3(unidades: Unidad[], movs: Movimiento[], cfg: Config): (string | number)[][] {
  const desde = primerPeriodo(movs);
  const filas: (string | number)[][] = [
    ["unidad", "periodo", "cuota", "monto_pagado", "fecha_pago", "dias_retraso", "pago_a_tiempo", "meses_deuda_previos", "moroso"],
  ];
  for (const u of unidades.filter((x) => x.activa)) {
    const ps = estadoUnidad(u, movs, cfg, desde).filter((p) => p.estado !== "por_vencer");
    let deudaPrev = 0;
    for (const p of ps) {
      const aTiempo = p.estado === "pagado" && (p.diasRetraso ?? 0) === 0 ? 1 : 0;
      const moroso = p.estado === "pendiente" || p.estado === "parcial" || (p.diasRetraso ?? 0) > 15 ? 1 : 0;
      filas.push([u.codigo, p.periodo, p.cuota, p.pagado, p.fechaPago ?? "", p.diasRetraso ?? "", aTiempo, deudaPrev, moroso]);
      deudaPrev = p.estado === "pendiente" || p.estado === "parcial" ? deudaPrev + 1 : 0;
    }
  }
  return filas;
}
