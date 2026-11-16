// Alertas preventivas de morosidad (APF3 · US12 / US13)
// Usa el modelo entrenado en ml/APF3_TD_Grupo5_ML_Innovacion.ipynb (regresión logística).
// Las variables se calculan igual que en ml/morosidad_ml.py: solo con los pagos registrados
// antes del día 1 del mes que se predice. Si la API de Python (ml/api_ml.py) no responde,
// la web aplica la misma fórmula con los parámetros exportados en ml/model_params.json.
import type { Config, Movimiento, Unidad } from "./types";
import { aplicarPagos, primerPeriodo } from "./morosidad";
import params from "../../ml/model_params.json";

export const UMBRAL_RETRASO = 15;
const TOPE_RETRASO = 30;

export interface MesHistorial {
  periodo: string;
  cuota: number;
  monto_pagado: number;
  dias_retraso: number | null;
}

export interface RegistroML {
  unidad: string;
  periodo_objetivo: string;
  historial: MesHistorial[];
}

export interface VariablesML {
  meses_historial: number;
  meses_deuda_previos: number;
  moroso_mes_anterior: number;
  tasa_morosidad_hist: number;
  retraso_prom_3m: number;
  pagos_puntuales_3m: number;
  es_mes_gratificacion: number;
  es_campana_escolar: number;
  torre: string;
}

export interface PrediccionML {
  unidad: string;
  periodo_objetivo: string;
  probabilidad_morosidad: number;
  umbral: number;
  riesgo: "alto" | "medio" | "bajo";
  alerta: boolean;
  accion: string;
  version_modelo: string;
}

export const MODELO = params;

const r2 = (n: number) => Math.round(n * 100) / 100;
const pagado = (h: MesHistorial) => h.monto_pagado >= h.cuota - 0.01;

// Misma definición del contrato de datos de APF2
export function esMoroso(h: MesHistorial): number {
  return !pagado(h) || (h.dias_retraso ?? 0) > UMBRAL_RETRASO ? 1 : 0;
}

// Historial de la unidad tal como lo veía el MVP el día 1 del periodo objetivo
export function historialAlCorte(u: Unidad, movs: Movimiento[], cfg: Config, periodoObjetivo: string): MesHistorial[] {
  const corte = `${periodoObjetivo}-01`;
  const previos = movs.filter((m) => m.fecha < corte);
  const desde = primerPeriodo(movs);
  return aplicarPagos(u, previos, cfg, desde)
    .periodos.filter((p) => p.periodo < periodoObjetivo)
    .map((p) => ({
      periodo: p.periodo,
      cuota: p.cuota,
      monto_pagado: p.pagado,
      dias_retraso: p.diasRetraso,
    }));
}

export function registroUnidad(u: Unidad, movs: Movimiento[], cfg: Config, periodoObjetivo: string): RegistroML {
  return { unidad: u.codigo, periodo_objetivo: periodoObjetivo, historial: historialAlCorte(u, movs, cfg, periodoObjetivo) };
}

// Igual que calcular_variables() de ml/morosidad_ml.py
export function calcularVariables(historial: MesHistorial[], periodoObjetivo: string, unidad: string): VariablesML {
  const hist = [...historial].sort((a, b) => a.periodo.localeCompare(b.periodo));
  const mes = Number(periodoObjetivo.slice(5, 7));
  const morosos = hist.map(esMoroso);

  let consecutivos = 0;
  for (let i = hist.length - 1; i >= 0; i--) {
    if (pagado(hist[i])) break;
    consecutivos++;
  }
  const ultimos = hist.slice(-3);
  const retrasos = ultimos.map((h) => (pagado(h) ? Math.min(h.dias_retraso ?? 0, TOPE_RETRASO) : TOPE_RETRASO));

  return {
    meses_historial: hist.length,
    meses_deuda_previos: consecutivos,
    moroso_mes_anterior: morosos.length ? morosos[morosos.length - 1] : 0,
    tasa_morosidad_hist: morosos.length ? Math.round((morosos.reduce((s, x) => s + x, 0) / morosos.length) * 10000) / 10000 : 0,
    retraso_prom_3m: retrasos.length ? r2(retrasos.reduce((s, x) => s + x, 0) / retrasos.length) : 0,
    pagos_puntuales_3m: ultimos.filter((h) => pagado(h) && (h.dias_retraso ?? 0) === 0).length,
    es_mes_gratificacion: mes === 7 || mes === 12 ? 1 : 0,
    es_campana_escolar: mes === 3 ? 1 : 0,
    torre: unidad.split("-")[0],
  };
}

export function probabilidad(x: VariablesML): number {
  let z = params.intercepto;
  params.columnas.forEach((col, i) => {
    let valor: number;
    if (col.startsWith("num__")) {
      const nombre = col.slice(5) as keyof VariablesML;
      const j = params.variables_num.indexOf(nombre);
      valor = ((x[nombre] as number) - params.media[j]) / params.escala[j];
    } else {
      // one-hot de torre (columna "cat__torre_B")
      valor = x.torre === col.split("_").pop() ? 1 : 0;
    }
    z += params.coeficientes[i] * valor;
  });
  return 1 / (1 + Math.exp(-z));
}

export function nivelRiesgo(prob: number, umbral = params.umbral): PrediccionML["riesgo"] {
  if (prob >= Math.max(umbral, 0.7)) return "alto";
  if (prob >= umbral) return "medio";
  return "bajo";
}

// Mismo resultado que predecir() de ml/morosidad_ml.py
export function predecirLocal(r: RegistroML): PrediccionML {
  const prob = probabilidad(calcularVariables(r.historial, r.periodo_objetivo, r.unidad));
  const alerta = prob >= params.umbral;
  return {
    unidad: r.unidad,
    periodo_objetivo: r.periodo_objetivo,
    probabilidad_morosidad: Math.round(prob * 1000) / 1000,
    umbral: params.umbral,
    riesgo: nivelRiesgo(prob),
    alerta,
    accion: alerta ? "Enviar recordatorio antes del día 10" : "Sin acción",
    version_modelo: params.version,
  };
}

// Pide las predicciones a la API de Python; si no responde, calcula en el navegador
export async function predecirLote(
  registros: RegistroML[],
  apiUrl: string | null,
): Promise<{ predicciones: PrediccionML[]; motor: "api" | "local" }> {
  if (apiUrl) {
    try {
      const res = await fetch(`${apiUrl}/api/v1/predecir-lote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registros),
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) return { predicciones: (await res.json()) as PrediccionML[], motor: "api" };
    } catch {
      // sin respuesta: se usa el cálculo local
    }
  }
  return { predicciones: registros.map(predecirLocal), motor: "local" };
}

// Motivos en palabras simples para el administrador (no se muestran al vecino)
export function motivos(x: VariablesML): string[] {
  const m: string[] = [];
  if (x.meses_deuda_previos > 0) m.push(`Debe ${x.meses_deuda_previos} mes(es)`);
  if (x.moroso_mes_anterior) m.push("El mes pasado pagó tarde o no pagó");
  if (x.meses_historial > 0 && x.pagos_puntuales_3m === 0) m.push("Ningún pago puntual en los últimos 3 meses");
  else if (x.pagos_puntuales_3m === 3) m.push("Pagó puntual los últimos 3 meses");
  if (x.retraso_prom_3m > UMBRAL_RETRASO) m.push(`Retraso promedio de ${Math.round(x.retraso_prom_3m)} días`);
  if (x.es_campana_escolar) m.push("Marzo: campaña escolar");
  if (x.es_mes_gratificacion) m.push("Mes de gratificación");
  return m.length ? m : ["Sin señales de atraso"];
}

// Recordatorio cordial por WhatsApp (US13): no menciona puntajes ni deudas de otros vecinos
export function enlaceWhatsApp(u: Unidad, periodo: string, diaVencimiento: number): string {
  const tel = (u.telefono || "").replace(/\D/g, "");
  const numero = tel.startsWith("51") ? tel : `51${tel}`;
  const nombre = (u.propietario || "").split(" ")[0];
  const mensaje =
    `Hola${nombre ? ` ${nombre}` : ""}, le saludamos de la Junta de Propietarios Parcela 2-A. ` +
    `Le recordamos que la cuota de vigilancia de ${periodo} (S/ ${u.cuota.toFixed(2)}) del departamento ${u.codigo} ` +
    `vence el día ${diaVencimiento}. Si ya pagó, puede reportar su n° de operación en la web. ¡Gracias por su apoyo!`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
