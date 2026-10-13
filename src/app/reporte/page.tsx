"use client";
import { useMemo, useState } from "react";
import { useData } from "@/components/DataProvider";
import { Shell } from "@/components/ui";
import { reporteMensual } from "@/lib/morosidad";
import { nombrePeriodo, periodoActual, soles, sumarMeses } from "@/lib/util";

function Contenido() {
  const { db, cfg } = useData();
  const [periodo, setPeriodo] = useState(sumarMeses(periodoActual(), -1));
  const opciones = Array.from({ length: 12 }, (_, i) => sumarMeses(periodoActual(), -i));
  const r = useMemo(() => reporteMensual(periodo, db.unidades, db.movimientos, db.egresos), [periodo, db]);
  const detalle = db.egresos.filter((e) => e.fecha.slice(0, 7) === periodo).sort((a, b) => a.fecha.localeCompare(b.fecha));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2 print:hidden">
        <div>
          <h1 className="h1">Reporte mensual de ingresos y egresos</h1>
          <p className="muted">Visible para todos los propietarios. No muestra datos personales de otras unidades.</p>
        </div>
        <div className="flex gap-2">
          <select className="input w-44" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {opciones.map((p) => (
              <option key={p} value={p}>{nombrePeriodo(p, true)}</option>
            ))}
          </select>
          <button className="btn" onClick={() => window.print()}>Imprimir / PDF</button>
        </div>
      </div>

      <div className="card space-y-4">
        <div>
          <div className="text-lg font-semibold">{cfg.nombre}</div>
          <div className="muted">Reporte de {nombrePeriodo(periodo, true)}{cfg.ruc ? ` · RUC ${cfg.ruc}` : ""}</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="border border-slate-200 rounded-md p-3">
            <div className="muted">Ingresos por cuotas (conciliados con el banco)</div>
            <div className="text-2xl font-semibold tabular-nums">{soles(r.ingresos)}</div>
            <div className="text-xs text-slate-500">{r.pagaron} de {r.totalUnidades} unidades pagaron · esperado {soles(r.esperado)}</div>
          </div>
          <div className="border border-slate-200 rounded-md p-3">
            <div className="muted">Egresos</div>
            <div className="text-2xl font-semibold tabular-nums">{soles(r.egresos)}</div>
            <div className="text-xs text-slate-500">{detalle.length} gasto(s) registrado(s)</div>
          </div>
          <div className="border border-slate-200 rounded-md p-3">
            <div className="muted">Saldo del mes</div>
            <div className={`text-2xl font-semibold tabular-nums ${r.saldo < 0 ? "text-red-700" : ""}`}>{soles(r.saldo)}</div>
            <div className="text-xs text-slate-500">Ingresos − egresos</div>
          </div>
        </div>

        <div>
          <div className="h2 mb-2">Egresos por categoría</div>
          {r.egresosPorCategoria.length === 0 ? (
            <p className="muted">No hay egresos registrados en este mes.</p>
          ) : (
            <div className="space-y-2">
              {r.egresosPorCategoria.map((c) => (
                <div key={c.categoria} className="grid grid-cols-[120px_1fr_auto] items-center gap-3 text-sm">
                  <div>{c.categoria}</div>
                  <div className="h-3 bg-slate-100 rounded"><div className="h-3 bg-teal-600 rounded" style={{ width: `${(c.monto / Math.max(1, r.egresos)) * 100}%` }} /></div>
                  <div className="tabular-nums w-28 text-right">{soles(c.monto)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {detalle.length > 0 && (
          <div className="overflow-x-auto">
            <div className="h2 mb-2">Detalle de egresos</div>
            <table className="tabla">
              <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th className="text-right">Monto</th></tr></thead>
              <tbody>
                {detalle.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">{e.fecha}</td>
                    <td>{e.concepto}</td>
                    <td>{e.categoria}</td>
                    <td className="text-right tabular-nums">{soles(e.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-500">Generado automáticamente el {new Date().toLocaleString("es-PE")}. Los ingresos solo incluyen pagos confirmados contra el estado de cuenta bancario.</p>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Shell rol="cualquiera">
      <Contenido />
    </Shell>
  );
}
