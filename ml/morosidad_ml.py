# morosidad_ml.py
# Funciones compartidas por el notebook, el script de predicción y la API.
# Replican las reglas del MVP (src/lib/morosidad.ts): vencimiento el día 10,
# cada pago se aplica primero al mes más antiguo pendiente (FIFO) y
# moroso = no pagó, pagó parcial o pagó con más de 15 días de retraso.
from datetime import date

CUOTA = 280.0
DIA_VENC = 10
UMBRAL_RETRASO = 15
TOPE_RETRASO = 30  # un mes sin pagar cuenta como 30 días de retraso en el promedio

VARIABLES_NUM = [
    "meses_historial", "meses_deuda_previos", "moroso_mes_anterior",
    "tasa_morosidad_hist", "retraso_prom_3m", "pagos_puntuales_3m",
    "es_mes_gratificacion", "es_campana_escolar",
]
VARIABLES_CAT = ["torre"]
VARIABLES = VARIABLES_NUM + VARIABLES_CAT
# deuda_soles se calcula para mostrarla en el MVP, pero no entra al modelo:
# en el EDA tiene correlación 1.00 con meses_deuda_previos (repite la misma información).


def _periodo(p):
    """'2026-03' -> (2026, 3)"""
    y, m = str(p).split("-")
    return int(y), int(m)


def aplicar_pagos_fifo(pagos, periodos, cuota=CUOTA):
    """Igual que aplicarPagos() del MVP.
    pagos: lista de (fecha: date, monto: float). periodos: lista 'AAAA-MM' ordenada.
    Devuelve una fila por periodo con monto_pagado, fecha_pago, dias_retraso y estado."""
    meses = {p: {"pagado": 0.0, "fecha": None} for p in periodos}
    saldo_favor = 0.0
    for fecha, monto in sorted(pagos):
        resto = monto
        for p in periodos:
            if resto <= 0.005:
                break
            falta = cuota - meses[p]["pagado"]
            if falta <= 0.005:
                continue
            aplica = min(resto, falta)
            meses[p]["pagado"] = round(meses[p]["pagado"] + aplica, 2)
            meses[p]["fecha"] = fecha
            resto -= aplica
        if resto > 0.005:
            saldo_favor += resto
    filas = []
    for p in periodos:
        y, m = _periodo(p)
        venc = date(y, m, DIA_VENC)
        f = meses[p]["fecha"]
        pagado = meses[p]["pagado"]
        if pagado >= cuota - 0.01:
            estado = "pagado"
        elif pagado > 0:
            estado = "parcial"
        else:
            estado = "pendiente"
        filas.append({
            "periodo": p,
            "cuota": cuota,
            "monto_pagado": pagado,
            "fecha_pago": f.isoformat() if f else "",
            "dias_retraso": max(0, (f - venc).days) if f else None,
            "estado": estado,
        })
    return filas, round(saldo_favor, 2)


def es_moroso(fila):
    """Variable objetivo del contrato de datos de APF2."""
    pagado = fila["monto_pagado"] >= fila["cuota"] - 0.01
    retraso = fila["dias_retraso"] or 0
    return int((not pagado) or retraso > UMBRAL_RETRASO)


def calcular_variables(historial, periodo_objetivo, unidad):
    """Variables del modelo con la información disponible el día 1 del mes a predecir.
    historial: meses anteriores al periodo_objetivo, tal como los muestra el MVP ese día
    (periodo, cuota, monto_pagado, dias_retraso). No usa nada del mes que se predice."""
    hist = sorted(historial, key=lambda h: h["periodo"])
    _, mes = _periodo(periodo_objetivo)
    pagados = [h["monto_pagado"] >= h["cuota"] - 0.01 for h in hist]
    morosos = [es_moroso(h) for h in hist]

    consecutivos = 0
    for ok in reversed(pagados):
        if ok:
            break
        consecutivos += 1

    ultimos = hist[-3:]
    retrasos = []
    for h in ultimos:
        if h["monto_pagado"] >= h["cuota"] - 0.01:
            retrasos.append(min(h["dias_retraso"] or 0, TOPE_RETRASO))
        else:
            retrasos.append(TOPE_RETRASO)

    return {
        "meses_historial": len(hist),
        "meses_deuda_previos": consecutivos,
        "deuda_soles": round(sum(max(0.0, h["cuota"] - h["monto_pagado"]) for h in hist), 2),
        "moroso_mes_anterior": morosos[-1] if morosos else 0,
        "tasa_morosidad_hist": round(sum(morosos) / len(morosos), 4) if morosos else 0.0,
        "retraso_prom_3m": round(sum(retrasos) / len(retrasos), 2) if retrasos else 0.0,
        "pagos_puntuales_3m": sum(
            1 for h in ultimos if h["monto_pagado"] >= h["cuota"] - 0.01 and (h["dias_retraso"] or 0) == 0
        ),
        "es_mes_gratificacion": int(mes in (7, 12)),
        "es_campana_escolar": int(mes == 3),
        "torre": str(unidad).split("-")[0],
    }


def nivel_riesgo(prob, umbral):
    if prob >= max(umbral, 0.70):
        return "alto"
    if prob >= umbral:
        return "medio"
    return "bajo"


def predecir(registro, artefacto):
    """registro: JSON del MVP {unidad, periodo_objetivo, historial:[...]}.
    artefacto: diccionario guardado con joblib (modelo + umbral)."""
    import pandas as pd

    x = calcular_variables(registro["historial"], registro["periodo_objetivo"], registro["unidad"])
    X = pd.DataFrame([x])[artefacto["variables"]]
    prob = float(artefacto["modelo"].predict_proba(X)[0, 1])
    umbral = artefacto["umbral"]
    alerta = prob >= umbral
    return {
        "unidad": registro["unidad"],
        "periodo_objetivo": registro["periodo_objetivo"],
        "probabilidad_morosidad": round(prob, 3),
        "umbral": umbral,
        "riesgo": nivel_riesgo(prob, umbral),
        "alerta": bool(alerta),
        "accion": "Enviar recordatorio antes del día 10" if alerta else "Sin acción",
        "version_modelo": artefacto["version"],
    }
