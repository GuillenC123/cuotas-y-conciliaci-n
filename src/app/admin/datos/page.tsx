"use client";
import { useMemo } from "react";
import { useData } from "@/components/DataProvider";
import { Shell } from "@/components/ui";
import { datasetAPF3 } from "@/lib/morosidad";
import { descargarCSV } from "@/lib/util";

const DICCIONARIO: [string, string, string][] = [
  ["unidad", "texto", "Código de la unidad (identificador, no es dato personal)"],
  ["periodo", "texto YYYY-MM", "Mes de la cuota"],
  ["cuota", "número (S/)", "Cuota mensual que corresponde a la unidad"],
  ["monto_pagado", "número (S/)", "Suma de abonos conciliados con el banco para ese mes"],
  ["fecha_pago", "fecha", "Fecha del último abono del mes (vacío si no pagó)"],
  ["dias_retraso", "entero", "Días entre el vencimiento y la fecha de pago"],
  ["pago_a_tiempo", "0 / 1", "1 si pagó completo hasta el día de vencimiento"],
  ["meses_deuda_previos", "entero", "Meses consecutivos impagos antes de este periodo"],
  ["moroso", "0 / 1", "Variable objetivo: no pagó, pagó parcial o pagó con más de 15 días de retraso"],
];

function Contenido() {
  const { db, cfg } = useData();
  const ds = useMemo(() => datasetAPF3(db.unidades, db.movimientos, cfg), [db, cfg]);
  const filas = ds.length - 1;
  const morosos = ds.slice(1).filter((f) => f[8] === 1).length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">Datos para el modelo (APF3)</h1>
          <p className="muted">Dataset generado a partir de los pagos conciliados. Una fila por unidad y mes. Sin nombres ni teléfonos.</p>
        </div>
        <button className="btn-primary" onClick={() => descargarCSV("dataset_morosidad.csv", ds)}>Descargar dataset CSV</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card"><div className="muted">Registros</div><div className="text-2xl font-semibold">{filas}</div></div>
        <div className="card"><div className="muted">Casos morosos (clase 1)</div><div className="text-2xl font-semibold">{morosos}</div></div>
        <div className="card"><div className="muted">Proporción morosa</div><div className="text-2xl font-semibold">{filas ? Math.round((morosos / filas) * 100) : 0}%</div></div>
      </div>
      <div className="card overflow-x-auto">
        <div className="h2 mb-2">Diccionario de datos</div>
        <table className="tabla">
          <thead><tr><th>Campo</th><th>Tipo</th><th>Descripción</th></tr></thead>
          <tbody>
            {DICCIONARIO.map(([c, t, d]) => (
              <tr key={c}><td className="font-mono text-xs">{c}</td><td>{t}</td><td>{d}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card overflow-x-auto">
        <div className="h2 mb-2">Vista previa (primeras 10 filas)</div>
        <table className="tabla">
          <thead><tr>{ds[0].map((h) => <th key={String(h)} className="font-mono text-xs">{h}</th>)}</tr></thead>
          <tbody>
            {ds.slice(1, 11).map((f, i) => (
              <tr key={i}>{f.map((v, j) => <td key={j} className="tabular-nums">{v}</td>)}</tr>
            ))}
          </tbody>
        </table>
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
