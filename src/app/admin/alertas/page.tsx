"use client";
import { useEffect, useMemo, useState } from "react";
import { useData } from "@/components/DataProvider";
import { Shell } from "@/components/ui";
import { estadoUnidad, primerPeriodo } from "@/lib/morosidad";
import {
  MODELO,
  PrediccionML,
  VariablesML,
  calcularVariables,
  enlaceWhatsApp,
  esMoroso,
  motivos,
  nivelRiesgo,
  predecirLote,
  probabilidad,
  registroUnidad,
} from "@/lib/ml";
import { nombrePeriodo, periodoActual, soles, sumarMeses } from "@/lib/util";

// En local se usa la API de Python (npm run api). En la web publicada, la URL se define con
// NEXT_PUBLIC_ML_API_URL; si no hay API, la web calcula la misma fórmula sin servidor.
function urlApi(): string | null {
  if (typeof window !== "undefined" && window.location.hostname === "localhost") return "http://localhost:8000";
  return process.env.NEXT_PUBLIC_ML_API_URL || null;
}

const ESTILO_RIESGO: Record<string, string> = {
  alto: "bg-red-100 text-red-800 border-red-300",
  medio: "bg-amber-100 text-amber-800 border-amber-300",
  bajo: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

export default function AlertasPage() {
  const { db, cfg } = useData();
  const actual = periodoActual();
  const [periodo, setPeriodo] = useState(actual);
  const [soloAlertas, setSoloAlertas] = useState(true);
  const [motor, setMotor] = useState<"api" | "local" | "cargando">("cargando");
  const [preds, setPreds] = useState<PrediccionML[]>([]);

  const inicio = primerPeriodo(db.movimientos);
  const opciones = useMemo(() => {
    const out = [actual];
    for (let k = 1; k <= 6; k++) {
      const p = sumarMeses(actual, -k);
      if (p > inicio) out.push(p); // se necesita al menos un mes de historial
    }
    return out;
  }, [actual, inicio]);

  const activas = useMemo(() => db.unidades.filter((u) => u.activa), [db.unidades]);
  const registros = useMemo(
    () => activas.map((u) => registroUnidad(u, db.movimientos, cfg, periodo)),
    [activas, db.movimientos, cfg, periodo],
  );

  useEffect(() => {
    let vivo = true;
    setMotor("cargando");
    predecirLote(registros, urlApi()).then((r) => {
      if (!vivo) return;
      setPreds(r.predicciones);
      setMotor(r.motor);
    });
    return () => {
      vivo = false;
    };
  }, [registros]);

  // Para meses pasados se compara la predicción con lo que realmente pasó
  const esPasado = periodo < actual;
  const filas = useMemo(() => {
    const porCodigo = new Map(preds.map((p) => [p.unidad, p]));
    return activas
      .map((u, i) => {
        const pred = porCodigo.get(u.codigo);
        const vars = calcularVariables(registros[i].historial, periodo, u.codigo);
        let real: number | null = null;
        if (esPasado) {
          const fin = estadoUnidad(u, db.movimientos, cfg, inicio).find((p) => p.periodo === periodo);
          if (fin) real = esMoroso({ periodo, cuota: fin.cuota, monto_pagado: fin.pagado, dias_retraso: fin.diasRetraso });
        }
        return { u, pred, vars, real };
      })
      .filter((f) => f.pred)
      .sort((a, b) => b.pred!.probabilidad_morosidad - a.pred!.probabilidad_morosidad);
  }, [preds, activas, registros, periodo, esPasado, db.movimientos, cfg, inicio]);

  const alertas = filas.filter((f) => f.pred!.alerta);
  const altos = alertas.filter((f) => f.pred!.riesgo === "alto").length;
  const visibles = soloAlertas ? alertas : filas;
  const morososReales = filas.filter((f) => f.real === 1).length;
  const detectados = filas.filter((f) => f.real === 1 && f.pred!.alerta).length;
  const cuota = activas[0]?.cuota || 280;

  return (
    <Shell rol="admin">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="h1">Alertas de morosidad (US12)</h1>
            <p className="muted mt-1 max-w-2xl">
              El modelo estima qué unidades caerán en mora en el mes elegido usando solo los pagos registrados antes del
              día 1. Sirve para recordarles antes del vencimiento (día {cfg.diaVencimiento}).
            </p>
          </div>
          <div className="text-right text-xs text-slate-500 space-y-0.5">
            <div>
              Cálculo:{" "}
              <span className="font-semibold text-slate-700">
                {motor === "cargando" ? "…" : motor === "api" ? "API de Python (FastAPI)" : "en el navegador (misma fórmula)"}
              </span>
            </div>
            <div>
              {MODELO.modelo} · umbral {MODELO.umbral} · {MODELO.version}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="card">
            <div className="text-xs text-slate-500">Unidades con alerta</div>
            <div className="text-2xl font-bold">
              {alertas.length} <span className="text-sm font-normal text-slate-500">de {filas.length}</span>
            </div>
          </div>
          <div className="card">
            <div className="text-xs text-slate-500">Riesgo alto (≥ 70 %)</div>
            <div className="text-2xl font-bold text-red-700">{altos}</div>
          </div>
          <div className="card">
            <div className="text-xs text-slate-500">Cuotas en riesgo</div>
            <div className="text-2xl font-bold">{soles(alertas.length * cuota)}</div>
          </div>
          <div className="card">
            {esPasado ? (
              <>
                <div className="text-xs text-slate-500">Morosos reales detectados</div>
                <div className="text-2xl font-bold">
                  {detectados} <span className="text-sm font-normal text-slate-500">de {morososReales}</span>
                </div>
              </>
            ) : (
              <>
                <div className="text-xs text-slate-500">Mes evaluado</div>
                <div className="text-lg font-bold">{nombrePeriodo(periodo, true)}</div>
              </>
            )}
          </div>
        </div>

        <div className="card space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm">
              Mes a predecir{" "}
              <select className="input inline-block w-auto ml-1" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
                {opciones.map((p) => (
                  <option key={p} value={p}>
                    {nombrePeriodo(p, true)}
                    {p === actual ? " (mes actual)" : " (revisar con lo que pasó)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm flex items-center gap-1.5">
              <input type="checkbox" checked={soloAlertas} onChange={(e) => setSoloAlertas(e.target.checked)} />
              Mostrar solo unidades con alerta
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Unidad</th>
                  <th>Propietario</th>
                  <th className="text-center">Meses que debe</th>
                  <th className="text-center">Pagos puntuales (3 m)</th>
                  <th className="text-center">Probabilidad</th>
                  <th className="text-center">Riesgo</th>
                  <th>Motivos</th>
                  {esPasado && <th className="text-center">¿Fue moroso?</th>}
                  <th className="text-center">Recordatorio</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(({ u, pred, vars, real }) => (
                  <tr key={u.id}>
                    <td className="font-semibold">{u.codigo}</td>
                    <td className="whitespace-nowrap">{u.propietario}</td>
                    <td className="text-center tabular-nums">{vars.meses_deuda_previos}</td>
                    <td className="text-center tabular-nums">{vars.pagos_puntuales_3m}</td>
                    <td className="text-center tabular-nums font-semibold">{(pred!.probabilidad_morosidad * 100).toFixed(0)} %</td>
                    <td className="text-center">
                      <span className={`px-2 py-0.5 rounded border text-xs font-semibold ${ESTILO_RIESGO[pred!.riesgo]}`}>
                        {pred!.riesgo.toUpperCase()}
                      </span>
                    </td>
                    <td className="text-xs text-slate-600">{motivos(vars).join(" · ")}</td>
                    {esPasado && (
                      <td className="text-center text-xs">
                        {real === null ? "-" : real === 1 ? <span className="text-red-700 font-semibold">Sí</span> : "No"}
                      </td>
                    )}
                    <td className="text-center">
                      {pred!.alerta && !esPasado ? (
                        <a
                          className="btn text-xs py-1"
                          href={enlaceWhatsApp(u, nombrePeriodo(periodo, true), cfg.diaVencimiento)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          WhatsApp
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center text-slate-500 py-6">
                      Ninguna unidad supera el umbral de alerta este mes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            La probabilidad solo la ve el administrador. El mensaje de WhatsApp es un recordatorio general y no menciona
            puntajes ni deudas. Datos de entrenamiento simulados: los resultados son indicativos.
          </p>
        </div>

        <Simulador />
      </div>
    </Shell>
  );
}

// Para la exposición: mover los datos de una unidad y ver cómo cambia la probabilidad
function Simulador() {
  const [deuda, setDeuda] = useState(0);
  const [morosoAnt, setMorosoAnt] = useState(0);
  const [puntuales, setPuntuales] = useState(2);
  const [retraso, setRetraso] = useState(5);
  const [tasa, setTasa] = useState(0.2);
  const [mes, setMes] = useState("normal");
  const [torre, setTorre] = useState("A");

  const vars: VariablesML = {
    meses_historial: 6,
    meses_deuda_previos: deuda,
    moroso_mes_anterior: morosoAnt,
    tasa_morosidad_hist: tasa,
    retraso_prom_3m: retraso,
    pagos_puntuales_3m: puntuales,
    es_mes_gratificacion: mes === "gratificacion" ? 1 : 0,
    es_campana_escolar: mes === "marzo" ? 1 : 0,
    torre,
  };
  const prob = probabilidad(vars);
  const riesgo = nivelRiesgo(prob);

  const fila = "flex items-center justify-between gap-3 text-sm";
  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">Simulador del modelo</h2>
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
        <label className={fila}>
          Meses que debe: {deuda}
          <input type="range" min={0} max={4} value={deuda} onChange={(e) => setDeuda(Number(e.target.value))} />
        </label>
        <label className={fila}>
          Pagos puntuales en los últimos 3 meses: {puntuales}
          <input type="range" min={0} max={3} value={puntuales} onChange={(e) => setPuntuales(Number(e.target.value))} />
        </label>
        <label className={fila}>
          Retraso promedio (3 meses): {retraso} días
          <input type="range" min={0} max={30} value={retraso} onChange={(e) => setRetraso(Number(e.target.value))} />
        </label>
        <label className={fila}>
          % de meses en mora en su historial: {Math.round(tasa * 100)} %
          <input type="range" min={0} max={1} step={0.05} value={tasa} onChange={(e) => setTasa(Number(e.target.value))} />
        </label>
        <label className={fila}>
          ¿El mes pasado fue moroso?
          <select className="input w-auto" value={morosoAnt} onChange={(e) => setMorosoAnt(Number(e.target.value))}>
            <option value={0}>No</option>
            <option value={1}>Sí</option>
          </select>
        </label>
        <label className={fila}>
          Mes
          <select className="input w-auto" value={mes} onChange={(e) => setMes(e.target.value)}>
            <option value="normal">Mes normal</option>
            <option value="marzo">Marzo (campaña escolar)</option>
            <option value="gratificacion">Julio o diciembre (gratificación)</option>
          </select>
        </label>
        <label className={fila}>
          Torre
          <select className="input w-auto" value={torre} onChange={(e) => setTorre(e.target.value)}>
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3 border-t pt-3">
        <span className="text-sm">Probabilidad de mora:</span>
        <span className="text-2xl font-bold tabular-nums">{(prob * 100).toFixed(1)} %</span>
        <span className={`px-2 py-0.5 rounded border text-xs font-semibold ${ESTILO_RIESGO[riesgo]}`}>
          {riesgo.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
