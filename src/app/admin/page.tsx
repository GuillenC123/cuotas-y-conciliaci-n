"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useData } from "@/components/DataProvider";
import { Shell, Stat } from "@/components/ui";
import { reporteMensual, tablaMorosidad } from "@/lib/morosidad";
import { nombrePeriodo, periodoActual, soles, sumarMeses } from "@/lib/util";

function Contenido() {
  const { db, cfg } = useData();
  const actual = periodoActual();
  const mor = useMemo(() => tablaMorosidad(db.unidades, db.movimientos, cfg), [db, cfg]);
  const alDia = mor.filter((f) => f.alDia).length;
  const deuda = mor.reduce((s, f) => s + f.deuda, 0);
  const repActual = reporteMensual(actual, db.unidades, db.movimientos, db.egresos);
  const porRevisar = db.movimientos.filter((m) => m.estado === "revisar").length;
  const repPend = db.reportes.filter((r) => r.estado === "pendiente").length;
  const ultimo = [...db.lotes].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const meses = Array.from({ length: 6 }, (_, i) => sumarMeses(actual, i - 5)).map((p) => reporteMensual(p, db.unidades, db.movimientos, db.egresos));
  const max = Math.max(1, ...meses.map((m) => Math.max(m.esperado, m.ingresos)));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">Resumen</h1>
          <p className="muted">Situación de cuotas al {new Date().toLocaleDateString("es-PE")}</p>
        </div>
        <Link href="/admin/conciliar" className="btn-primary">Cargar estado de cuenta</Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat titulo="Unidades al día" valor={`${mor.length ? Math.round((alDia / mor.length) * 100) : 0}%`} nota={`${alDia} de ${mor.length} unidades`} />
        <Stat titulo="Unidades con deuda" valor={String(mor.length - alDia)} nota={`Deuda total ${soles(deuda)}`} />
        <Stat titulo={`Recaudado ${nombrePeriodo(actual)}`} valor={soles(repActual.ingresos)} nota={`de ${soles(repActual.esperado)} esperado`} />
        <Stat
          titulo="Última conciliación"
          valor={ultimo ? `${Math.round((ultimo.automaticos / Math.max(1, ultimo.filas - ultimo.duplicados)) * 100)}% automático` : "—"}
          nota={ultimo ? `${ultimo.filas} movimientos en ${(ultimo.ms / 1000).toFixed(2)} s` : "Aún no se cargó ningún estado de cuenta"}
        />
      </div>

      {(porRevisar > 0 || repPend > 0) && (
        <div className="card flex flex-wrap items-center justify-between gap-2 border-orange-200 bg-orange-50">
          <div className="text-sm">
            {porRevisar > 0 && <span>{porRevisar} pago(s) sin identificar esperan revisión. </span>}
            {repPend > 0 && <span>{repPend} pago(s) reportado(s) por vecinos aún no aparecen en el banco.</span>}
          </div>
          <Link href="/admin/conciliar" className="btn">Revisar</Link>
        </div>
      )}

      <div className="card">
        <div className="h2 mb-3">Recaudación de los últimos 6 meses</div>
        <div className="space-y-2">
          {meses.map((m) => (
            <div key={m.periodo} className="grid grid-cols-[70px_1fr_auto] items-center gap-3 text-sm">
              <div className="text-slate-500">{nombrePeriodo(m.periodo)}</div>
              <div className="relative h-5 bg-slate-100 rounded">
                <div className="absolute inset-y-0 left-0 bg-teal-600 rounded" style={{ width: `${(m.ingresos / max) * 100}%` }} />
                <div className="absolute inset-y-0 border-r-2 border-slate-500" style={{ left: `${(m.esperado / max) * 100}%` }} title="Esperado" />
              </div>
              <div className="tabular-nums text-right w-36">
                {soles(m.ingresos)} <span className="text-slate-400">· {m.pagaron}/{m.totalUnidades}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="text-xs text-slate-500 mt-2">La línea vertical marca lo esperado si todas las unidades pagan.</div>
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
