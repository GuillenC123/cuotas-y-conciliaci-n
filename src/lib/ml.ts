// Inferencia de Machine Learning (APF3 - US12 / US13)
// Regresión Logística Regularizada L2 (C=0.25)
import type { Config, Movimiento, Unidad } from "./types";
import { estadoUnidad } from "./morosidad";
import datasetAPF3Json from "./dataset_apf3.json";

export interface MLFeatures {
  unidad: string;
  periodo_objetivo: string;
  cuota: number;
  meses_deuda_previos: number;
  retraso_mes_anterior: number;
  promedio_retraso_3m: number;
  tasa_puntualidad_hist: number;
  ratio_pago_anterior: number;
  indice_deterioro_pago: number;
  canal_pago_habitual: string;
  bloque: string;
}

export interface DatasetRow {
  unidad: string;
  periodo: string;
  cuota: number;
  monto_pagado: number;
  fecha_pago: string;
  dias_retraso: number;
  pago_a_tiempo: number;
  meses_deuda_previos: number;
  retraso_mes_anterior: number;
  promedio_retraso_3m: number;
  tasa_puntualidad_hist: number;
  ratio_pago_anterior: number;
  indice_deterioro_pago: number;
  canal_pago_habitual: string;
  bloque: string;
  origen: string;
  moroso: number;
}

// Mapa indexado de los 336 registros calibrados del APF3 (unidad × periodo)
const DATASET_APF3_MAP = new Map<string, DatasetRow>();
(datasetAPF3Json as unknown as DatasetRow[]).forEach((row) => {
  DATASET_APF3_MAP.set(`${row.unidad}@${row.periodo}`, row);
});

export interface MLPrediction {
  unidad: string;
  periodo_objetivo: string;
  prediccion_moroso: number; // 0 o 1
  probabilidad_mora: number; // 0.000 a 1.000
  umbral_decision: number; // 0.50
  nivel_riesgo: "ALTO" | "MEDIO" | "BAJO";
  accion_sugerida_mvp: string;
  latencia_ms: number;
  modelo_version: string;
  factores_riesgo: string[];
  origen_motor: "FastAPI (Python)" | "Local (Fallback Resiliente)";
}

// Parámetros calibrados y exportados en modelo_morosidad_parcela2a.joblib
export const ML_PARAMS = {
  version: "LR-v1.0-Parcela2A",
  threshold: 0.50,
  intercept: 0.09486952712306838,
  weights: [
    0.31103905442509794,  // meses_deuda_previos
    0.8414874549162012,   // retraso_mes_anterior
    0.9678041759003938,   // promedio_retraso_3m
    -0.6661403229915037,  // tasa_puntualidad_hist
    -0.30356580683252504, // ratio_pago_anterior
    0.7341485991625357,   // indice_deterioro_pago
    -0.4143700338776622,  // canal: codigo_descripcion
    0.5032110058615196,   // canal: deposito_efectivo
    -0.6375056559559501,  // canal: transferencia_nombre
    0.5486613272380791,   // canal: yape_plin
    0.0382718901360697,   // bloque: A
    0.43324580698068826,  // bloque: B
    -0.20715190797362074, // bloque: C
    -0.2643691458771507   // bloque: D
  ],
  means: {
    meses_deuda_previos: 0.22916666666666666,
    retraso_mes_anterior: 11.54861111111111,
    promedio_retraso_3m: 10.26871527777778,
    tasa_puntualidad_hist: 0.33260416666666665,
    ratio_pago_anterior: 0.8767361111111112,
    indice_deterioro_pago: 15.571736111111115
  },
  stds: {
    meses_deuda_previos: 0.5555121510822243,
    retraso_mes_anterior: 13.138329137125165,
    promedio_retraso_3m: 11.194174425022247,
    tasa_puntualidad_hist: 0.3604493187280672,
    ratio_pago_anterior: 0.2879171607837321,
    indice_deterioro_pago: 19.53116808711218
  },
  canales: ["codigo_descripcion", "deposito_efectivo", "transferencia_nombre", "yape_plin"],
  bloques: ["A", "B", "C", "D"]
};

// Cálculo del Índice de Deterioro de Pago (IDP)
export function calcularIDP(retrasoAnt: number, prom3m: number, deudaPrev: number, ratioAnt: number): number {
  return Math.round((0.55 * retrasoAnt + 0.45 * prom3m + 12.0 * deudaPrev + 15.0 * (1.0 - ratioAnt)) * 100) / 100;
}

// Extrae las características pre-vencimiento de una unidad a partir de su historial cerrado t-1
export function extraerFeaturesUnidad(u: Unidad, movs: Movimiento[], cfg: Config, periodoObjetivo: string): MLFeatures {
  const bloque = u.codigo.split("-")[0] || "A";

  // 1. Si existe en el dataset oficial calibrado del APF3 (2026-04 a 2026-10), usar los valores exactos
  const keyExacta = `${u.codigo}@${periodoObjetivo}`;
  const d = DATASET_APF3_MAP.get(keyExacta);
  if (d) {
    return {
      unidad: d.unidad,
      periodo_objetivo: periodoObjetivo,
      cuota: Number(d.cuota) || u.cuota,
      meses_deuda_previos: Number(d.meses_deuda_previos) || 0,
      retraso_mes_anterior: Number(d.retraso_mes_anterior) || 0,
      promedio_retraso_3m: Number(d.promedio_retraso_3m) || 0,
      tasa_puntualidad_hist: Number(d.tasa_puntualidad_hist) || 0,
      ratio_pago_anterior: Number(d.ratio_pago_anterior) || 0,
      indice_deterioro_pago: Number(d.indice_deterioro_pago) || 0,
      canal_pago_habitual: d.canal_pago_habitual || "yape_plin",
      bloque: d.bloque || bloque
    };
  }

  // 2. Si es 2026-11 (proyección entrante), proyectar a partir del cierre real de 2026-10
  const keyOct = `${u.codigo}@2026-10`;
  const oct = DATASET_APF3_MAP.get(keyOct);
  if (periodoObjetivo === "2026-11" && oct) {
    const sep = DATASET_APF3_MAP.get(`${u.codigo}@2026-09`);
    const ago = DATASET_APF3_MAP.get(`${u.codigo}@2026-08`);

    const retrasoOct = Number(oct.dias_retraso) || (oct.monto_pagado < oct.cuota ? 30 : 0);
    const retrasoSep = sep ? (Number(sep.dias_retraso) || (sep.monto_pagado < sep.cuota ? 30 : 0)) : 0;
    const retrasoAgo = ago ? (Number(ago.dias_retraso) || (ago.monto_pagado < ago.cuota ? 30 : 0)) : 0;
    const prom3m = Math.round(((retrasoOct + retrasoSep + retrasoAgo) / 3.0) * 100) / 100;

    const deudaPrev = oct.monto_pagado < oct.cuota ? (Number(oct.meses_deuda_previos) || 0) + 1 : 0;
    const ratioAnt = oct.cuota > 0 ? Math.min(1.0, (Number(oct.monto_pagado) || 0) / oct.cuota) : 1.0;
    const puntualidad = Number(oct.tasa_puntualidad_hist) || 0;
    const idp = calcularIDP(retrasoOct, prom3m, deudaPrev, ratioAnt);

    return {
      unidad: u.codigo,
      periodo_objetivo: periodoObjetivo,
      cuota: u.cuota,
      meses_deuda_previos: deudaPrev,
      retraso_mes_anterior: retrasoOct,
      promedio_retraso_3m: prom3m,
      tasa_puntualidad_hist: puntualidad,
      ratio_pago_anterior: ratioAnt,
      indice_deterioro_pago: idp,
      canal_pago_habitual: oct.canal_pago_habitual || "yape_plin",
      bloque: oct.bloque || bloque
    };
  }

  // 3. Fallback dinámico sobre movimientos cargados manualmente en el MVP
  const ps = estadoUnidad(u, movs, cfg, "2026-04").filter((p) => p.periodo < periodoObjetivo);
  
  const pagos = movs.filter((m) => m.unidadId === u.id);
  let canalHabitual = "transferencia_nombre";
  if (pagos.some((m) => m.descripcion.toUpperCase().includes("YAPE") || m.descripcion.toUpperCase().includes("PLIN"))) {
    canalHabitual = "yape_plin";
  } else if (pagos.some((m) => m.descripcion.toUpperCase().includes("DEPOSITO") || m.descripcion.toUpperCase().includes("EFECTIVO") || m.descripcion.toUpperCase().includes("AGENTE"))) {
    canalHabitual = "deposito_efectivo";
  } else if (pagos.some((m) => m.descripcion.toUpperCase().includes(u.codigo.toUpperCase()))) {
    canalHabitual = "codigo_descripcion";
  }

  if (ps.length === 0) {
    return {
      unidad: u.codigo,
      periodo_objetivo: periodoObjetivo,
      cuota: u.cuota,
      meses_deuda_previos: 0,
      retraso_mes_anterior: 0,
      promedio_retraso_3m: 0,
      tasa_puntualidad_hist: 1.0,
      ratio_pago_anterior: 1.0,
      indice_deterioro_pago: 0,
      canal_pago_habitual: canalHabitual,
      bloque
    };
  }

  const ultMes = ps[ps.length - 1];
  const ult3 = ps.slice(-3);

  const retrasoAnt = ultMes.diasRetraso ?? (ultMes.estado === "pendiente" ? 30 : 0);
  const retrasos3 = ult3.map((p) => p.diasRetraso ?? (p.estado === "pendiente" ? 30 : 0));
  const prom3m = Math.round((retrasos3.reduce((s, r) => s + r, 0) / Math.max(1, ult3.length)) * 100) / 100;

  const mesesPuntuales = ps.filter((p) => p.estado === "pagado" && (p.diasRetraso ?? 0) === 0).length;
  const tasaPuntual = Math.round((mesesPuntuales / ps.length) * 1000) / 1000;

  const ratioAnt = ultMes.cuota > 0 ? Math.min(1.0, Math.round((ultMes.pagado / ultMes.cuota) * 100) / 100) : 1.0;

  let deudaPrev = 0;
  for (let i = ps.length - 1; i >= 0; i--) {
    if (ps[i].estado === "pendiente" || ps[i].estado === "parcial") deudaPrev++;
    else break;
  }

  const idp = calcularIDP(retrasoAnt, prom3m, deudaPrev, ratioAnt);

  return {
    unidad: u.codigo,
    periodo_objetivo: periodoObjetivo,
    cuota: u.cuota,
    meses_deuda_previos: deudaPrev,
    retraso_mes_anterior: retrasoAnt,
    promedio_retraso_3m: prom3m,
    tasa_puntualidad_hist: tasaPuntual,
    ratio_pago_anterior: ratioAnt,
    indice_deterioro_pago: idp,
    canal_pago_habitual: canalHabitual,
    bloque
  };
}

// Inferencia puramente en TypeScript con las fórmulas exactas del modelo
export function inferenciaLocal(ft: MLFeatures): MLPrediction {
  const t0 = performance.now();

  const numScaled = [
    (ft.meses_deuda_previos - ML_PARAMS.means.meses_deuda_previos) / ML_PARAMS.stds.meses_deuda_previos,
    (ft.retraso_mes_anterior - ML_PARAMS.means.retraso_mes_anterior) / ML_PARAMS.stds.retraso_mes_anterior,
    (ft.promedio_retraso_3m - ML_PARAMS.means.promedio_retraso_3m) / ML_PARAMS.stds.promedio_retraso_3m,
    (ft.tasa_puntualidad_hist - ML_PARAMS.means.tasa_puntualidad_hist) / ML_PARAMS.stds.tasa_puntualidad_hist,
    (ft.ratio_pago_anterior - ML_PARAMS.means.ratio_pago_anterior) / ML_PARAMS.stds.ratio_pago_anterior,
    (ft.indice_deterioro_pago - ML_PARAMS.means.indice_deterioro_pago) / ML_PARAMS.stds.indice_deterioro_pago
  ];

  const catOHE: number[] = [];
  for (const c of ML_PARAMS.canales) {
    catOHE.push(ft.canal_pago_habitual === c ? 1.0 : 0.0);
  }
  for (const b of ML_PARAMS.bloques) {
    catOHE.push(ft.bloque === b ? 1.0 : 0.0);
  }

  const xVector = [...numScaled, ...catOHE];
  let z = ML_PARAMS.intercept;
  for (let i = 0; i < xVector.length; i++) {
    z += ML_PARAMS.weights[i] * xVector[i];
  }

  z = Math.max(-30.0, Math.min(30.0, z));
  const prob = 1.0 / (1.0 + Math.exp(-z));
  const pred = prob >= ML_PARAMS.threshold ? 1 : 0;

  let nivel: "ALTO" | "MEDIO" | "BAJO" = "BAJO";
  if (prob >= 0.70) nivel = "ALTO";
  else if (prob >= 0.50) nivel = "MEDIO";

  const factores: string[] = [];
  if (ft.meses_deuda_previos > 0) factores.push(`Arrastra ${ft.meses_deuda_previos} mes(es) con deuda impaga`);
  if (ft.retraso_mes_anterior > 15) factores.push(`Retraso severo el mes anterior (${ft.retraso_mes_anterior} días)`);
  else if (ft.retraso_mes_anterior > 5) factores.push(`Retraso leve el mes anterior (${ft.retraso_mes_anterior} días)`);
  if (ft.promedio_retraso_3m > 15) factores.push(`Inercia trimestral de pago tardío (${ft.promedio_retraso_3m.toFixed(1)} días)`);
  if (ft.canal_pago_habitual === "deposito_efectivo" || ft.canal_pago_habitual === "yape_plin") {
    factores.push(`Canal con mayor fricción (${ft.canal_pago_habitual.replace("_", " ")})`);
  }
  if (factores.length === 0 && nivel !== "BAJO") {
    factores.push("Patrón estocástico de riesgo detectado");
  } else if (factores.length === 0) {
    factores.push("Historial de pagos puntual y regular");
  }

  const accion = pred === 1
    ? "Enviar recordatorio preventivo por WhatsApp (US13) 3 días antes del día 10 y marcar alerta prioritaria en panel de Tesorería (US12)"
    : "No requiere acción preventiva; mantener seguimiento regular de cobranza";

  const latencia = Math.round((performance.now() - t0) * 100) / 100;

  return {
    unidad: ft.unidad,
    periodo_objetivo: ft.periodo_objetivo,
    prediccion_moroso: pred,
    probabilidad_mora: Math.round(prob * 10000) / 10000,
    umbral_decision: ML_PARAMS.threshold,
    nivel_riesgo: nivel,
    accion_sugerida_mvp: accion,
    latencia_ms: latencia,
    modelo_version: ML_PARAMS.version,
    factores_riesgo: factores,
    origen_motor: "Local (Fallback Resiliente)"
  };
}

// Inferencia remota conectando al microservicio FastAPI (si está en línea) o fallback local
export async function predecirConFallback(ft: MLFeatures, backendUrl = "http://localhost:8000"): Promise<MLPrediction> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    const res = await fetch(`${backendUrl}/api/v1/predecir-morosidad`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ft),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return {
        ...data,
        origen_motor: "FastAPI (Python)"
      };
    }
  } catch {
    // Si el backend no responde, entra silenciosa y limpiamente el motor local
  }

  return inferenciaLocal(ft);
}

// Plantilla de WhatsApp cordial para cobranza preventiva (US13)
export function enlaceWhatsAppPreventivo(u: Unidad, ft: MLFeatures, pred: MLPrediction, diaVencimiento = 10): string {
  const telefonoLimpio = (u.telefono || "").replace(/\D/g, "");
  const tel = telefonoLimpio.startsWith("51") ? telefonoLimpio : `51${telefonoLimpio}`;
  
  const mensaje = `Hola, estimado(a) vecino(a) del Dpto. ${u.codigo} (${u.propietario.split(" ")[0]}):

Le saludamos cordialmente de la Junta de Propietarios de Parcela 2-A. Le recordamos amablemente que la cuota ordinaria de vigilancia perimetral correspondiente al periodo ${ft.periodo_objetivo} (S/ ${u.cuota.toFixed(2)}) vence este día ${diaVencimiento}.

Mantenernos al día nos permite asegurar el pago puntual del personal de seguridad privada (SUCAMEC) de nuestra caseta.

¡Muchas gracias por su colaboración y compromiso con la tranquilidad de nuestra comunidad! 🏡🛡️`;

  return `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`;
}

