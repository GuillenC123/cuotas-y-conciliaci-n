// Datos de EJEMPLO (ficticios) para la demo. Se reemplazan por los del condominio real.
import type { Config, DB, Egreso, Movimiento, ReportePago, Unidad } from "./types";
import { periodoActual, sumarMeses } from "./util";

function prng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOMBRES = ["Carlos", "María", "José", "Rosa", "Luis", "Ana", "Jorge", "Lucía", "Miguel", "Carmen", "Pedro", "Elena", "Raúl", "Patricia", "Víctor", "Gloria", "Fernando", "Silvia", "Ricardo", "Teresa", "Óscar", "Diana", "Javier", "Milagros"];
const APELLIDOS = ["Quispe", "Flores", "Rojas", "Huamán", "Mendoza", "Torres", "Vargas", "Castillo", "Ramírez", "Chávez", "Gutiérrez", "Salazar", "Paredes", "Espinoza", "Cárdenas", "Ríos", "Herrera", "Medina", "Navarro", "Aguilar", "Delgado", "Palacios", "Sánchez", "Villanueva", "Campos", "Zevallos"];

export const CUOTA_DEMO = 280;

export function configDemo(): Config {
  return {
    id: "main",
    nombre: "Junta de Propietarios Parcela 2-A (Av. Canta Callao)",
    ruc: "20609186951",
    distrito: "Callao",
    cuota: CUOTA_DEMO,
    diaVencimiento: 10,
    claveAdmin: "admin123",
    modoDemo: true,
  };
}

export function unidadesDemo(): Unidad[] {
  const r = prng(7);
  const out: Unidad[] = [];
  const usados = new Set<string>();
  for (const torre of ["A", "B", "C", "D"]) {
    for (let piso = 1; piso <= 3; piso++) {
      for (let d = 1; d <= 4; d++) {
        const codigo = `${torre}-${piso}0${d}`;
        let nombre = "";
        do {
          const n = NOMBRES[Math.floor(r() * NOMBRES.length)];
          const a1 = APELLIDOS[Math.floor(r() * APELLIDOS.length)];
          let a2 = APELLIDOS[Math.floor(r() * APELLIDOS.length)];
          if (a2 === a1) a2 = APELLIDOS[(APELLIDOS.indexOf(a1) + 3) % APELLIDOS.length];
          nombre = `${n} ${a1} ${a2}`;
        } while (usados.has(nombre));
        usados.add(nombre);
        out.push({
          id: `U-${codigo}`,
          codigo,
          propietario: nombre,
          telefono: `9${String(Math.floor(r() * 1e8)).padStart(8, "0")}`,
          cuota: CUOTA_DEMO,
          pin: String(1000 + Math.floor(r() * 9000)),
          activa: true,
        });
      }
    }
  }
  return out;
}

function sinTildes(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

function descripcionPago(u: Unidad, periodo: string, r: () => number): string {
  const mes = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SET", "OCT", "NOV", "DIC"][Number(periodo.slice(5, 7)) - 1];
  const [n, a1, a2] = sinTildes(u.propietario).split(" ");
  const x = r();
  if (x < 0.35) return `PAGO MANT ${u.codigo.replace("-", "")} ${mes}`;
  if (x < 0.6) return `TRANSF DE ${n} ${a1} ${a2}`;
  if (x < 0.8) return `YAPE DE ${n} ${a1} ${a2.slice(0, 1)}.`;
  return `PLIN ${n} ${a1} ${a2} - ${u.codigo}`;
}

// Historial de pagos de los 6 meses anteriores (ya conciliado)
import datasetAPF3Json from "./dataset_apf3.json";
import type { DatasetRow } from "./ml";

function historialDemo(unidades: Unidad[]): Movimiento[] {
  const mapUnidad = new Map(unidades.map((u) => [u.codigo, u]));
  const movs: Movimiento[] = [];
  let op = 81200000;

  (datasetAPF3Json as unknown as DatasetRow[]).forEach((row) => {
    if (row.monto_pagado > 0) {
      const u = mapUnidad.get(row.unidad);
      if (!u) return;

      const parcial = row.monto_pagado < row.cuota;
      let desc = `TRANSF DE ${u.propietario}`;
      if (row.canal_pago_habitual === "yape_plin") desc = `YAPE DE ${u.propietario.split(" ")[0]} ${u.propietario.split(" ")[1] || ""}`;
      else if (row.canal_pago_habitual === "deposito_efectivo") desc = `DEPOSITO EFECTIVO AG 0193`;
      else if (row.canal_pago_habitual === "codigo_descripcion") desc = `PAGO MANT ${u.codigo} ${row.periodo}`;

      movs.push({
        id: `MH-${row.periodo}-${u.codigo}`,
        fecha: row.fecha_pago || `${row.periodo}-08`,
        descripcion: desc,
        monto: Number(row.monto_pagado),
        operacion: String(op++),
        periodo: row.periodo,
        unidadId: u.id,
        estado: parcial ? "parcial" : "conciliado",
        regla: row.canal_pago_habitual === "codigo_descripcion" ? "codigo" : "nombre",
        loteId: "L-historico",
        creadoEn: new Date().toISOString(),
      });
    }
  });

  return movs;
}

function egresosDemo(): Egreso[] {
  const actual = periodoActual();
  const out: Egreso[] = [];
  for (let k = 6; k >= 0; k--) {
    const p = sumarMeses(actual, -k);
    const base = [
      ["Servicio de vigilancia (2 agentes, empresa formal)", "Vigilancia", 7800],
      ["Limpieza de áreas comunes", "Limpieza", 1800],
      ["Luz de áreas comunes", "Servicios", 920 + (k % 3) * 45],
      ["Mantenimiento de ascensores", "Mantenimiento", 650],
      ["Útiles de limpieza y varios", "Varios", 260 + (k % 2) * 80],
    ] as const;
    base.forEach(([concepto, categoria, monto], j) => {
      // del mes actual solo se registran los gastos ya pagados (vigilancia y limpieza)
      if (k === 0 && j > 1) return;
      out.push({ id: `E-${p}-${j}`, fecha: `${p}-05`, concepto, categoria, monto });
    });
  }
  return out;
}

export function dbDemo(): DB {
  const unidades = unidadesDemo();
  const reportes: ReportePago[] = [
    {
      id: "R-demo-1",
      unidadId: "U-B-304",
      fecha: `${periodoActual()}-03`,
      monto: CUOTA_DEMO,
      operacion: "90500077",
      estado: "pendiente",
      creadoEn: new Date().toISOString(),
    },
  ];
  return {
    config: configDemo(),
    unidades,
    movimientos: historialDemo(unidades),
    lotes: [],
    reportes,
    egresos: egresosDemo(),
  };
}

// Estado de cuenta bancario de EJEMPLO del mes actual, para probar la conciliación
export function estadoCuentaEjemplo(unidades: Unidad[]): string {
  const r = prng(99);
  const p = periodoActual();
  const filas: string[][] = [["Fecha", "Descripcion", "Monto", "Nro Operacion"]];
  let op = 90500001;
  const elegidas = unidades.filter((u) => r() < 0.72 && u.id !== "U-B-304");
  elegidas.forEach((u, i) => {
    const dia = String(1 + Math.floor(r() * 12)).padStart(2, "0");
    const fecha = `${dia}/${p.slice(5, 7)}/${p.slice(0, 4)}`;
    let desc = descripcionPago(u, p, r);
    let monto = String(u.cuota.toFixed(2));
    if (i === 5) monto = "140.00"; // pago parcial
    if (i === 9) monto = "300.00"; // pagó de más
    if (i === 12) desc = "DEPOSITO EFECTIVO AG 0193"; // no identificable -> revisar
    if (i === 17) desc = "YAPE DE R. QUISPE"; // ambiguo -> revisar
    filas.push([fecha, desc, monto, String(op++)]);
  });
  // pago reportado por el vecino de B-304 (descripción no dice la unidad, pero el n° de operación coincide)
  filas.push([`03/${p.slice(5, 7)}/${p.slice(0, 4)}`, "TRANSF INTERBANCARIA CCI", "280.00", "90500077"]);
  // operación repetida (el banco o el admin cargó dos veces la misma fila)
  const dup = filas[3];
  filas.push([dup[0], dup[1], dup[2], dup[3]]);
  // cargos del banco (se ignoran)
  filas.push([`10/${p.slice(5, 7)}/${p.slice(0, 4)}`, "COMISION MANTENIMIENTO CUENTA", "-15.00", "90509991"]);
  filas.push([`10/${p.slice(5, 7)}/${p.slice(0, 4)}`, "ITF", "-1.20", "90509992"]);
  return filas.map((f) => f.map((c) => (c.includes(",") ? `"${c}"` : c)).join(",")).join("\n");
}
