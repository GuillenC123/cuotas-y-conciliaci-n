"use client";
import { useMemo, useState } from "react";
import { useData } from "@/components/DataProvider";
import { Badge, Shell } from "@/components/ui";
import { tablaMorosidad } from "@/lib/morosidad";
import { descargarCSV, nombrePeriodo, soles } from "@/lib/util";

const CELDA: Record<string, string> = {
  pagado: "bg-emerald-500",
  parcial: "bg-amber-400",
  pendiente: "bg-red-500",
  por_vencer: "bg-slate-200",
};

function Contenido() {
  const { db, cfg } = useData();
  const [soloDeuda, setSoloDeuda] = useState(false);
  const [buscar, setBuscar] = useState("");
  const filas = useMemo(() => tablaMorosidad(db.unidades, db.movimientos, cfg).sort((a, b) => b.deuda - a.deuda || a.unidad.codigo.localeCompare(b.unidad.codigo)), [db, cfg]);
  const q = buscar.trim().toUpperCase();
  const vis = filas.filter((f) => (!soloDeuda || !f.alDia) && (!q || f.unidad.codigo.toUpperCase().includes(q) || f.unidad.propietario.toUpperCase().includes(q)));
  const periodos = filas[0]?.periodos.map((p) => p.periodo) || [];

  const exportar = () =>
    descargarCSV("morosidad.csv", [
      ["unidad", "propietario", "meses_deuda", "deuda_soles", ...periodos],
      ...filas.map((f) => [f.unidad.codigo, f.unidad.propietario, f.mesesDeuda, f.deuda, ...f.periodos.map((p) => p.estado)]),
    ]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">Morosidad</h1>
          <p className="muted">
            {filas.filter((f) => !f.alDia).length} unidades con deuda · total {soles(filas.reduce((s, f) => s + f.deuda, 0))} · la cuota vence el día {cfg.diaVencimiento} de cada mes · cada pago se aplica al mes más antiguo pendiente
          </p>
        </div>
        <button className="btn" onClick={exportar}>Exportar CSV</button>
      </div>
      <div className="card space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <input className="input max-w-xs" placeholder="Buscar unidad o propietario" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={soloDeuda} onChange={(e) => setSoloDeuda(e.target.checked)} /> Solo unidades con deuda
          </label>
          <div className="flex gap-3 text-xs text-slate-600 ml-auto">
            {Object.entries(CELDA).map(([k, c]) => (
              <span key={k} className="flex items-center gap-1"><span className={`w-3 h-3 rounded-sm ${c}`} /> <Badge estado={k} /></span>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Unidad</th>
                <th>Propietario</th>
                {periodos.map((p) => (
                  <th key={p} className="text-center">{nombrePeriodo(p).split(" ")[0]}</th>
                ))}
                <th className="text-right">Meses</th>
                <th className="text-right">Deuda</th>
              </tr>
            </thead>
            <tbody>
              {vis.map((f) => (
                <tr key={f.unidad.id}>
                  <td className="font-medium">{f.unidad.codigo}</td>
                  <td className="whitespace-nowrap">{f.unidad.propietario}</td>
                  {f.periodos.map((p) => (
                    <td key={p.periodo} className="text-center">
                      <span
                        className={`inline-block w-4 h-4 rounded-sm ${CELDA[p.estado]}`}
                        title={`${nombrePeriodo(p.periodo)}: ${p.estado}${p.fechaPago ? ` · pagó ${p.fechaPago} (${p.diasRetraso} días de retraso)` : ""}`}
                      />
                    </td>
                  ))}
                  <td className="text-right tabular-nums">{f.mesesDeuda}</td>
                  <td className={`text-right tabular-nums ${f.deuda > 0 ? "text-red-700 font-medium" : ""}`}>{soles(f.deuda)}</td>
                </tr>
              ))}
              {vis.length === 0 && (
                <tr><td colSpan={periodos.length + 4} className="text-center muted py-6">Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Shell rol="admin">
      <Contenido />
    </Shell>
  );
}
