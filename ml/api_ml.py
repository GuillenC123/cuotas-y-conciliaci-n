# api_ml.py · Microservicio de predicción de morosidad (APF3, Grupo 5)
# Ejecutar dentro de la carpeta ml/:  uvicorn api_ml:app --port 8000
# Documentación interactiva:          http://localhost:8000/docs
# La pantalla "Alertas ML (US12)" del MVP llama a /api/v1/predecir-lote.
import time
from pathlib import Path
from typing import List, Optional

import joblib
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from morosidad_ml import predecir

CARPETA = Path(__file__).parent
artefacto = joblib.load(CARPETA / "modelo_morosidad.joblib")

app = FastAPI(
    title="Riesgo de morosidad · Junta de Propietarios Parcela 2-A",
    description="Predice qué unidades caerán en mora el mes indicado, con su historial de pagos del MVP.",
    version=artefacto["version"],
)

# Permite llamadas desde el MVP (localhost:3000 o Netlify)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Mes(BaseModel):
    periodo: str = Field(..., examples=["2026-10"], description="Mes de la cuota (AAAA-MM)")
    cuota: float = Field(..., examples=[280.0], description="Cuota del mes en soles")
    monto_pagado: float = Field(..., examples=[280.0], description="Monto aplicado a ese mes (FIFO)")
    dias_retraso: Optional[int] = Field(None, examples=[0], description="Días de retraso; vacío si no pagó")


class Registro(BaseModel):
    unidad: str = Field(..., examples=["B-304"], description="Código de la unidad (sin datos personales)")
    periodo_objetivo: str = Field(..., examples=["2026-11"], description="Mes que se quiere predecir")
    historial: List[Mes] = Field(..., description="Meses anteriores al periodo objetivo")


def _con_latencia(registro: Registro):
    t0 = time.perf_counter()
    salida = predecir(registro.model_dump(), artefacto)
    salida["latencia_ms"] = round((time.perf_counter() - t0) * 1000, 2)
    return salida


@app.get("/health")
def salud():
    return {"estado": "ok", "modelo": artefacto["modelo_nombre"], "version": artefacto["version"],
            "umbral": artefacto["umbral"]}


@app.post("/api/v1/predecir-morosidad")
def predecir_unidad(registro: Registro):
    return _con_latencia(registro)


@app.post("/api/v1/predecir-lote")
def predecir_lote(registros: List[Registro]):
    salida = [_con_latencia(r) for r in registros]
    return sorted(salida, key=lambda x: x["probabilidad_morosidad"], reverse=True)
