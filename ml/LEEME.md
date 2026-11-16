# APF3 · Grupo 5 · Modelo de morosidad

Junta de Propietarios Parcela 2-A (Residencial Ciudad Nueva, Callao). Todos los datos son **simulados** (columna `origen`).

## Cómo ejecutarlo
**En Google Colab:**
1. Sube `APF3_TD_Grupo5_ML_Innovacion.ipynb`.
2. Ejecuta *Entorno de ejecución > Ejecutar todo*.

No hace falta subir nada más: el notebook genera el dataset, crea `morosidad_ml.py`, entrena, evalúa y exporta el modelo.

**En tu PC:**
```
pip install -r requirements.txt
jupyter notebook APF3_TD_Grupo5_ML_Innovacion.ipynb
```

**API de integración** (desde la raíz del proyecto, o dentro de `ml/` con `python -m uvicorn api_ml:app --port 8000`):
```
npm run api
curl -X POST http://localhost:8000/api/v1/predecir-morosidad -H "Content-Type: application/json" -d @ml/ejemplo_entrada.json
```
Con la API encendida y la web en `npm run dev`, la pantalla **Alertas ML (US12)** pide las predicciones a la API. Si la API está apagada, calcula lo mismo en el navegador.

## Archivos
| Archivo | Para qué sirve |
|---|---|
| APF3_TD_Grupo5_ML_Innovacion.ipynb | Notebook ejecutado de inicio a fin (con salidas) |
| requirements.txt | Dependencias |
| morosidad_ml.py | Reglas del MVP (FIFO, moroso) y cálculo de variables. Lo usan el notebook y la API |
| api_ml.py | Microservicio FastAPI: `GET /health`, `POST /api/v1/predecir-morosidad` y `POST /api/v1/predecir-lote` |
| model_params.json | Medias, escalas, coeficientes y umbral para que la web calcule sin servidor |
| casos_paridad.json | 48 casos con la probabilidad de Python; la prueba del MVP verifica que la web dé lo mismo |
| dataset_morosidad_apf3.csv | Dataset con los campos del contrato de datos de APF2 + `origen` (576 filas) |
| tabla_modelado_apf3.csv | Variables calculadas al día 1 de cada mes + objetivo (528 filas) |
| modelo_morosidad.joblib | Pipeline (preprocesamiento + regresión logística) + umbral 0.6 |
| ejemplo_entrada.json / ejemplo_salida.json | Contrato de integración con el MVP |
| alertas_2026-11.csv | Lo que mostraría el MVP el 1 de noviembre: 18 unidades con alerta |
| tabla_metricas_test.csv | Tabla comparativa en el conjunto de prueba |
| evidencia_api.txt | Registro de llamadas reales a la API (curl y pantalla Alertas ML) |
| figuras/ | 5 figuras para el informe y la PPT |

## Resultados principales (conjunto de prueba: ago–oct 2026, 144 filas, 38 morosos)
| Modelo | Precisión | Recall | F1 |
|---|---|---|---|
| Línea base 1: siempre "al día" | 0.000 | 0.000 | 0.000 |
| Línea base 2: regla actual (recordar solo a quien ya debe) | 0.750 | 0.711 | 0.730 |
| **Regresión logística, umbral 0.6 (seleccionado)** | **0.702** | **0.868** | **0.776** |

- La meta del Paso 1 era recall ≥ 0.80 con precisión ≥ 0.60, y se cumple.
- El modelo detecta 33 de 38 morosos antes del vencimiento; la regla actual detecta 27.
- 6 de los detectados todavía no debían nada, así que la regla actual nunca los habría visto.
- Las variables más importantes son los pagos puntuales de los últimos 3 meses y los meses de deuda que la unidad ya arrastra.
- Los resultados son indicativos hasta validarlos con datos reales.
