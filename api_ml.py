import time
import json
import math
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Cargar parámetros del modelo exportado
with open("model_params.json", "r", encoding="utf-8") as f:
    PARAMS = json.load(f)

WEIGHTS = PARAMS["weights"]
INTERCEPT = PARAMS["intercept"]
THRESHOLD = PARAMS["threshold"]
VERSION = PARAMS["version"]
NUM_COLS = PARAMS["num_cols"]
CAT_COLS = PARAMS["cat_cols"]
MEDIANS = PARAMS["medians"]
MEANS = PARAMS["means"]
STDS = PARAMS["stds"]
CAT_CATEGORIES = PARAMS["cat_categories"]
FEATURE_NAMES = PARAMS["feature_names"]

app = FastAPI(
    title="Microservicio de Predicción de Morosidad (APF3)",
    description="API REST en FastAPI para la detección temprana de riesgo de morosidad en cuotas de vigilancia. Junta de Propietarios Parcela 2-A (Callao).",
    version=VERSION
)

# Habilitar CORS para permitir llamadas desde Next.js / Netlify
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class UnidadEntrada(BaseModel):
    unidad: str = Field(..., example="A-101", description="Código seudonimizado de la unidad inmobiliaria")
    periodo_objetivo: str = Field(..., example="2026-11", description="Periodo mensual a predecir (YYYY-MM)")
    cuota: float = Field(default=280.0, example=280.0, description="Monto de cuota mensual fija (S/)")
    meses_deuda_previos: int = Field(default=0, example=1, description="Meses impagos o parciales acumulados hasta t-1")
    retraso_mes_anterior: int = Field(default=0, example=31, description="Días de retraso del mes inmediatamente anterior")
    promedio_retraso_3m: float = Field(default=0.0, example=32.33, description="Media móvil de retraso en los últimos 3 meses (días)")
    tasa_puntualidad_hist: float = Field(default=1.0, example=0.143, description="Proporción histórica de cuotas pagadas puntuales")
    ratio_pago_anterior: float = Field(default=1.0, example=0.0, description="Cociente monto_pagado / cuota del mes t-1")
    indice_deterioro_pago: Optional[float] = Field(default=None, example=58.60, description="Índice de Deterioro de Pago (IDP)")
    canal_pago_habitual: str = Field(default="yape_plin", example="yape_plin", description="Medio habitual: transferencia_nombre, yape_plin, codigo_descripcion, deposito_efectivo")
    bloque: Optional[str] = Field(default=None, example="A", description="Bloque del edificio: A, B, C o D")

class PrediccionSalida(BaseModel):
    unidad: str
    periodo_objetivo: str
    prediccion_moroso: int
    probabilidad_mora: float
    umbral_decision: float
    nivel_riesgo: str
    accion_sugerida_mvp: str
    latencia_ms: float
    modelo_version: str
    factores_riesgo: List[str]

def calcular_idp(retraso_ant: float, prom_3m: float, deuda_prev: float, ratio_ant: float) -> float:
    return float(0.55 * retraso_ant + 0.45 * prom_3m + 12.0 * deuda_prev + 15.0 * (1.0 - ratio_ant))

def predecir_unidad(item: UnidadEntrada) -> PrediccionSalida:
    t0 = time.perf_counter()
    
    # Derivar bloque si no viene especificado
    bloque = item.bloque or (item.unidad.split("-")[0] if "-" in item.unidad else "A")
    if bloque not in CAT_CATEGORIES["bloque"]:
        bloque = "A"

    canal = item.canal_pago_habitual
    if canal not in CAT_CATEGORIES["canal_pago_habitual"]:
        canal = "yape_plin"

    # Derivar IDP si es None
    idp = item.indice_deterioro_pago
    if idp is None:
        idp = calcular_idp(
            float(item.retraso_mes_anterior),
            float(item.promedio_retraso_3m),
            float(item.meses_deuda_previos),
            float(item.ratio_pago_anterior)
        )

    # 1. Vector de variables numéricas escaladas con (x - mean) / std
    num_vals = {
        "meses_deuda_previos": float(item.meses_deuda_previos),
        "retraso_mes_anterior": float(item.retraso_mes_anterior),
        "promedio_retraso_3m": float(item.promedio_retraso_3m),
        "tasa_puntualidad_hist": float(item.tasa_puntualidad_hist),
        "ratio_pago_anterior": float(item.ratio_pago_anterior),
        "indice_deterioro_pago": float(idp)
    }

    x_vector = []
    for col in NUM_COLS:
        scaled = (num_vals[col] - MEANS[col]) / STDS[col]
        x_vector.append(scaled)

    # 2. Vector One-Hot para variables categóricas
    for c_val in CAT_CATEGORIES["canal_pago_habitual"]:
        x_vector.append(1.0 if canal == c_val else 0.0)

    for b_val in CAT_CATEGORIES["bloque"]:
        x_vector.append(1.0 if bloque == b_val else 0.0)

    # 3. Inferencia de Regresión Logística (w * x + b)
    z = sum(w * x for w, x in zip(WEIGHTS, x_vector)) + INTERCEPT
    # Clip numérico para estabilidad
    z = max(-30.0, min(30.0, z))
    prob = 1.0 / (1.0 + math.exp(-z))
    pred_class = 1 if prob >= THRESHOLD else 0

    # Nivel de riesgo cualitativo
    if prob >= 0.70:
        nivel = "ALTO"
    elif prob >= 0.50:
        nivel = "MEDIO"
    else:
        nivel = "BAJO"

    # Identificar factores de riesgo explicables
    factores = []
    if item.meses_deuda_previos > 0:
        factores.append(f"Arrastra {item.meses_deuda_previos} mes(es) con deuda impaga")
    if item.retraso_mes_anterior > 15:
        factores.append(f"Retraso severo el mes anterior ({item.retraso_mes_anterior} días)")
    elif item.retraso_mes_anterior > 5:
        factores.append(f"Retraso leve el mes anterior ({item.retraso_mes_anterior} días)")
    if item.promedio_retraso_3m > 15:
        factores.append(f"Inercia trimestral de pago tardío ({item.promedio_retraso_3m:.1f} días)")
    if canal in ("deposito_efectivo", "yape_plin"):
        factores.append(f"Canal con mayor fricción ({canal.replace('_', ' ').capitalize()})")
    if not factores and nivel != "BAJO":
        factores.append("Patrón estocástico de riesgo detectado")
    elif not factores:
        factores.append("Historial de pagos puntual y regular")

    accion = (
        "Enviar recordatorio preventivo por WhatsApp (US13) 3 días antes del día 10 y marcar alerta prioritaria en panel de Tesorería (US12)"
        if pred_class == 1
        else "No requiere acción preventiva; mantener seguimiento regular de cobranza"
    )

    latencia_ms = (time.perf_counter() - t0) * 1000.0

    return PrediccionSalida(
        unidad=item.unidad,
        periodo_objetivo=item.periodo_objetivo,
        prediccion_moroso=pred_class,
        probabilidad_mora=round(prob, 4),
        umbral_decision=THRESHOLD,
        nivel_riesgo=nivel,
        accion_sugerida_mvp=accion,
        latencia_ms=round(latencia_ms, 2),
        modelo_version=VERSION,
        factores_riesgo=factores
    )

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "Microservicio ML Morosidad Parcela 2-A",
        "version": VERSION,
        "model": "Regresión Logística Regularizada L2 (C=0.25)",
        "docs_url": "/docs"
    }

@app.get("/health")
def health():
    return {"status": "ok", "timestamp": time.time()}

@app.get("/api/v1/info")
def info():
    return {
        "model_version": VERSION,
        "algorithm": "Logistic Regression L2",
        "threshold": THRESHOLD,
        "features": FEATURE_NAMES,
        "coefficients": [
            {"feature": f, "weight": round(w, 4)} for f, w in zip(FEATURE_NAMES, WEIGHTS)
        ],
        "intercept": round(INTERCEPT, 4)
    }

@app.post("/api/v1/predecir-morosidad", response_model=PrediccionSalida)
def predecir_morosidad(payload: UnidadEntrada):
    return predecir_unidad(payload)

@app.post("/api/v1/predecir-lote", response_model=List[PrediccionSalida])
def predecir_lote(payload: List[UnidadEntrada]):
    return [predecir_unidad(u) for u in payload]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api_ml:app", host="0.0.0.0", port=8000, reload=True)

