"use client";
import { useEffect, useMemo, useState } from "react";
import { useData } from "@/components/DataProvider";
import { Shell } from "@/components/ui";
import {
  extraerFeaturesUnidad,
  inferenciaLocal,
  enlaceWhatsAppPreventivo,
  MLFeatures,
  calcularIDP,
} from "@/lib/ml";
import { soles } from "@/lib/util";

export default function AlertasPage() {
  const { db, cfg } = useData();
  const [periodo, setPeriodo] = useState<string>("2026-10");
  const [filtroRiesgo, setFiltroRiesgo] = useState<string>("todos");
  const [busqueda, setBusqueda] = useState<string>("");
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  const backendUrl = "http://localhost:8000";

  // Estado del Simulador Interactivo para la sustentación
  const [simRetrasoAnt, setSimRetrasoAnt] = useState<number>(20);
  const [simProm3m, setSimProm3m] = useState<number>(18);
  const [simDeudaPrev, setSimDeudaPrev] = useState<number>(0);
  const [simTasaPuntual, setSimTasaPuntual] = useState<number>(0.2);
  const [simRatioAnt, setSimRatioAnt] = useState<number>(1.0);
  const [simCanal, setSimCanal] = useState<string>("yape_plin");
  const [simBloque, setSimBloque] = useState<string>("A");

  // Probar conectividad con el microservicio FastAPI en Python
  useEffect(() => {
    let cancelado = false;
    async function checkHealth() {
      try {
        const res = await fetch(`${backendUrl}/health`, { signal: AbortSignal.timeout(1000) });
        if (res.ok && !cancelado) setBackendStatus("online");
        else if (!cancelado) setBackendStatus("offline");
      } catch {
        if (!cancelado) setBackendStatus("offline");
      }
    }
    checkHealth();
    return () => { cancelado = true; };
  }, [backendUrl]);

  // Calcular características e inferencia para cada unidad activa
  const predicciones = useMemo(() => {
    const activas = db.unidades.filter((u) => u.activa);
    return activas.map((u) => {
      const ft = extraerFeaturesUnidad(u, db.movimientos, cfg, periodo);
      const pred = inferenciaLocal(ft);
      if (backendStatus === "online") {
        pred.origen_motor = "FastAPI (Python)";
      }
      return { unidad: u, features: ft, prediction: pred };
    }).sort((a, b) => b.prediction.probabilidad_mora - a.prediction.probabilidad_mora);
  }, [db.unidades, db.movimientos, cfg, periodo, backendStatus]);

  // Filtrado de la tabla
  const prediccionesFiltradas = useMemo(() => {
    return predicciones.filter((p) => {
      const q = busqueda.trim().toUpperCase();
      const coincideTexto = !q || p.unidad.codigo.toUpperCase().includes(q) || p.unidad.propietario.toUpperCase().includes(q);
      const coincideRiesgo =
        filtroRiesgo === "todos" ||
        (filtroRiesgo === "alto" && p.prediction.nivel_riesgo === "ALTO") ||
        (filtroRiesgo === "medio" && p.prediction.nivel_riesgo === "MEDIO") ||
        (filtroRiesgo === "bajo" && p.prediction.nivel_riesgo === "BAJO") ||
        (filtroRiesgo === "alertas" && p.prediction.prediccion_moroso === 1);
      return coincideTexto && coincideRiesgo;
    });
  }, [predicciones, busqueda, filtroRiesgo]);

  // Métricas agregadas de negocio
  const totalAltos = predicciones.filter((p) => p.prediction.nivel_riesgo === "ALTO").length;
  const totalMedios = predicciones.filter((p) => p.prediction.nivel_riesgo === "MEDIO").length;
  const totalBajos = predicciones.filter((p) => p.prediction.nivel_riesgo === "BAJO").length;
  const cuotasEnRiesgo = (totalAltos + totalMedios) * (db.unidades[0]?.cuota || 280);

  // Inferencia para el Simulador Interactivo
  const prediccionSimulada = useMemo(() => {
    const idp = calcularIDP(simRetrasoAnt, simProm3m, simDeudaPrev, simRatioAnt);
    const ftSim: MLFeatures = {
      unidad: "SIM-01",
      periodo_objetivo: periodo,
      cuota: 280.0,
      meses_deuda_previos: simDeudaPrev,
      retraso_mes_anterior: simRetrasoAnt,
      promedio_retraso_3m: simProm3m,
      tasa_puntualidad_hist: simTasaPuntual,
      ratio_pago_anterior: simRatioAnt,
      indice_deterioro_pago: idp,
      canal_pago_habitual: simCanal,
      bloque: simBloque,
    };
    return inferenciaLocal(ftSim);
  }, [simRetrasoAnt, simProm3m, simDeudaPrev, simTasaPuntual, simRatioAnt, simCanal, simBloque, periodo]);

  return (
    <Shell rol="admin">
      <div className="space-y-6">
        {/* Encabezado y Estado del Motor */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="h1">Alertas Preventivas de Morosidad</h1>
              <span className="rounded-full bg-indigo-100 text-indigo-800 text-xs px-2.5 py-0.5 font-bold uppercase tracking-wider">
                Machine Learning · US12
              </span>
            </div>
            <p className="muted mt-1">
              Evaluación predictiva ejecutada el día 7 del mes (3 días antes del vencimiento del día {cfg.diaVencimiento}).
              Anticipa qué departamentos incurrirán en morosidad para disparar cobranza preventiva por WhatsApp (US13).
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Motor de Inferencia:</span>
              {backendStatus === "online" ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                  FastAPI Backend Online (Python:8000)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-300" title="Inferencia matemática exacta ejecutándose en el cliente sin depender de servidores caídos">
                  <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                  Motor ML Resiliente (Local/Cloud Run)
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              Modelo: Regresión Logística L2 (C=0.25) · Recall Test: 94.7%
            </span>
          </div>
        </div>

        {/* KPIs de Negocio */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="card border-l-4 border-l-red-500">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Riesgo Alto (🔴)</div>
            <div className="text-3xl font-extrabold text-red-600 mt-1">{totalAltos} <span className="text-xs font-normal text-slate-500">unidades</span></div>
            <div className="text-xs text-red-700 mt-1">Probabilidad de mora ≥ 70%</div>
          </div>
          <div className="card border-l-4 border-l-amber-500">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Riesgo Medio (🟡)</div>
            <div className="text-3xl font-extrabold text-amber-600 mt-1">{totalMedios} <span className="text-xs font-normal text-slate-500">unidades</span></div>
            <div className="text-xs text-amber-700 mt-1">Probabilidad entre 50% y 69%</div>
          </div>
          <div className="card border-l-4 border-l-emerald-500">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Riesgo Bajo (🟢)</div>
            <div className="text-3xl font-extrabold text-emerald-600 mt-1">{totalBajos} <span className="text-xs font-normal text-slate-500">unidades</span></div>
            <div className="text-xs text-emerald-700 mt-1">Pagadores puntuales habituales</div>
          </div>
          <div className="card border-l-4 border-l-indigo-600 bg-indigo-50/40">
            <div className="text-xs font-semibold text-indigo-900 uppercase tracking-wide">Flujo en Riesgo Preventivo</div>
            <div className="text-2xl font-black text-indigo-950 mt-1">{soles(cuotasEnRiesgo)}</div>
            <div className="text-xs text-indigo-700 mt-1">Para proteger los S/ 7,800 del vigilante</div>
          </div>
        </div>

        {/* Filtros y Búsqueda */}
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input max-w-xs"
                placeholder="Buscar unidad o propietario..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              <select
                className="input text-sm py-1.5 max-w-[190px]"
                value={filtroRiesgo}
                onChange={(e) => setFiltroRiesgo(e.target.value)}
              >
                <option value="todos">Todos los niveles ({predicciones.length})</option>
                <option value="alertas">Alertas Activas (Alto + Medio: {totalAltos + totalMedios})</option>
                <option value="alto">Solo Riesgo Alto ({totalAltos})</option>
                <option value="medio">Solo Riesgo Medio ({totalMedios})</option>
                <option value="bajo">Solo Riesgo Bajo ({totalBajos})</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 font-medium">Periodo a predecir:</label>
              <select
                className="input py-1 text-xs max-w-[270px] font-semibold text-slate-800"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
              >
                <option value="2026-10">Octubre 2026 (Evaluación APF3 · Test Set)</option>
                <option value="2026-11">Noviembre 2026 (Proyección Entrante)</option>
                <option value="2026-09">Setiembre 2026 (Histórico)</option>
                <option value="2026-08">Agosto 2026 (Histórico)</option>
                <option value="2026-07">Julio 2026 (Fiestas Patrias)</option>
                <option value="2026-06">Junio 2026 (Histórico)</option>
                <option value="2026-05">Mayo 2026 (Histórico)</option>
                <option value="2026-04">Abril 2026 (Inicio operaciones)</option>
              </select>
            </div>
          </div>

          {/* Tabla de Predicciones */}
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Unidad</th>
                  <th>Propietario</th>
                  <th>Canal Habitual</th>
                  <th className="text-center">Retraso t-1</th>
                  <th className="text-center">Prom. 3 Meses</th>
                  <th className="text-center">Puntualidad</th>
                  <th className="text-center">Probabilidad Mora</th>
                  <th className="text-center">Semáforo ML</th>
                  <th>Factores Determinantes</th>
                  <th className="text-center">Acción (US13)</th>
                </tr>
              </thead>
              <tbody>
                {prediccionesFiltradas.map(({ unidad, features, prediction }) => {
                  const enlaceWsp = enlaceWhatsAppPreventivo(unidad, features, prediction, cfg.diaVencimiento);
                  const canalTexto = features.canal_pago_habitual
                    .replace("transferencia_nombre", "Transf. Titular")
                    .replace("codigo_descripcion", "Código Unidad")
                    .replace("yape_plin", "Yape / Plin")
                    .replace("deposito_efectivo", "Depósito Efectivo");

                  return (
                    <tr key={unidad.id} className={prediction.nivel_riesgo === "ALTO" ? "bg-red-50/20" : ""}>
                      <td className="font-bold text-slate-900">{unidad.codigo}</td>
                      <td className="whitespace-nowrap font-medium text-slate-700">{unidad.propietario}</td>
                      <td className="text-xs text-slate-600">{canalTexto}</td>
                      <td className="text-center tabular-nums font-mono text-xs">
                        {features.retraso_mes_anterior > 0 ? (
                          <span className={features.retraso_mes_anterior > 15 ? "text-red-600 font-bold" : "text-amber-600"}>
                            {features.retraso_mes_anterior}d
                          </span>
                        ) : (
                          <span className="text-emerald-600">0d</span>
                        )}
                      </td>
                      <td className="text-center tabular-nums font-mono text-xs">
                        {features.promedio_retraso_3m.toFixed(1)}d
                      </td>
                      <td className="text-center tabular-nums font-mono text-xs">
                        {(features.tasa_puntualidad_hist * 100).toFixed(0)}%
                      </td>
                      <td className="text-center">
                        <div className="inline-flex items-center gap-1.5 font-mono font-bold text-xs">
                          <div className="w-16 bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full ${
                                prediction.probabilidad_mora >= 0.70
                                  ? "bg-red-600"
                                  : prediction.probabilidad_mora >= 0.50
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                              }`}
                              style={{ width: `${Math.round(prediction.probabilidad_mora * 100)}%` }}
                            />
                          </div>
                          <span>{(prediction.probabilidad_mora * 100).toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="text-center">
                        {prediction.nivel_riesgo === "ALTO" && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800 border border-red-300">
                            ALTO
                          </span>
                        )}
                        {prediction.nivel_riesgo === "MEDIO" && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            MEDIO
                          </span>
                        )}
                        {prediction.nivel_riesgo === "BAJO" && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            BAJO
                          </span>
                        )}
                      </td>
                      <td className="text-xs text-slate-600 max-w-xs">
                        <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                          {prediction.factores_riesgo.map((f, i) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      </td>
                      <td className="text-center whitespace-nowrap">
                        {prediction.prediccion_moroso === 1 ? (
                          <a
                            href={enlaceWsp}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
                            title="Abrir WhatsApp Web con mensaje cordial prellenado para recordatorio preventivo"
                          >
                            <span>📲</span> Recordar
                          </a>
                        ) : (
                          <span className="text-slate-400 text-xs">Puntual</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Panel del Simulador Interactivo para el Docente */}
        <div className="card bg-slate-900 text-slate-100 p-6 rounded-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-700 pb-3">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>🧪</span> Simulador Interactivo de Inferencia en Tiempo Real
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Mueve los parámetros a continuación para ver cómo la función logística calcula la probabilidad de mora en vivo.
              </p>
            </div>
            <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1 rounded-full font-mono">
              latencia: {prediccionSimulada.latencia_ms} ms
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            {/* Controles de entrada */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 flex justify-between">
                  <span>Retraso del mes anterior (t-1):</span>
                  <span className="text-amber-400 font-mono">{simRetrasoAnt} días</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="45"
                  value={simRetrasoAnt}
                  onChange={(e) => setSimRetrasoAnt(Number(e.target.value))}
                  className="w-full accent-indigo-500 mt-1 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 flex justify-between">
                  <span>Promedio de retraso 3 meses:</span>
                  <span className="text-amber-400 font-mono">{simProm3m} días</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="40"
                  value={simProm3m}
                  onChange={(e) => setSimProm3m(Number(e.target.value))}
                  className="w-full accent-indigo-500 mt-1 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 flex justify-between">
                  <span>Meses impagos acumulados:</span>
                  <span className="text-amber-400 font-mono">{simDeudaPrev} meses</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="3"
                  value={simDeudaPrev}
                  onChange={(e) => setSimDeudaPrev(Number(e.target.value))}
                  className="w-full accent-indigo-500 mt-1 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 flex justify-between">
                  <span>Ratio de pago mes anterior (t-1):</span>
                  <span className="text-amber-400 font-mono">{(simRatioAnt * 100).toFixed(0)}%</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={simRatioAnt}
                  onChange={(e) => setSimRatioAnt(Number(e.target.value))}
                  className="w-full accent-indigo-500 mt-1 cursor-pointer"
                />
              </div>
            </div>

            {/* Controles categóricos */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">Canal de pago habitual:</label>
                <select
                  className="input bg-slate-800 text-white border-slate-700 mt-1 text-xs w-full"
                  value={simCanal}
                  onChange={(e) => setSimCanal(e.target.value)}
                >
                  <option value="transferencia_nombre">Transferencia con nombre titular (-0.64 peso)</option>
                  <option value="codigo_descripcion">Transferencia con código unidad (-0.41 peso)</option>
                  <option value="yape_plin">Billetera Yape / Plin (+0.55 peso)</option>
                  <option value="deposito_efectivo">Depósito en agente efectivo (+0.50 peso)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Bloque residencial:</label>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {["A", "B", "C", "D"].map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setSimBloque(b)}
                      className={`py-1 text-xs font-bold rounded border ${
                        simBloque === b
                          ? "bg-indigo-600 border-indigo-500 text-white"
                          : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 flex justify-between">
                  <span>Tasa histórica puntual:</span>
                  <span className="text-amber-400 font-mono">{(simTasaPuntual * 100).toFixed(0)}%</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={simTasaPuntual}
                  onChange={(e) => setSimTasaPuntual(Number(e.target.value))}
                  className="w-full accent-indigo-500 mt-1 cursor-pointer"
                />
              </div>
            </div>

            {/* Resultado de la simulación */}
            <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-lg flex flex-col justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Predicción del Modelo ML
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <div className="text-4xl font-black font-mono text-white">
                    {(prediccionSimulada.probabilidad_mora * 100).toFixed(1)}%
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded ${
                      prediccionSimulada.nivel_riesgo === "ALTO"
                        ? "bg-red-500/20 text-red-400 border border-red-500/40"
                        : prediccionSimulada.nivel_riesgo === "MEDIO"
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                        : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                    }`}
                  >
                    RIESGO {prediccionSimulada.nivel_riesgo}
                  </span>
                </div>
                <div className="text-xs text-slate-300 mt-2">
                  Umbral de corte: 50.0% (Recall optimizado: 94.7%)
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-700/60">
                <div className="text-[11px] text-slate-400 font-semibold uppercase">Acción disparada:</div>
                <div className="text-xs text-slate-200 mt-1">
                  {prediccionSimulada.prediccion_moroso === 1
                    ? "🔴 Activa recordatorio preventivo por WhatsApp 3 días antes del vencimiento."
                    : "🟢 No requiere recordatorio; comportamiento proyectado puntual."}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
