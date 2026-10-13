"use client";
import { useMemo, useRef, useState } from "react";
import { useData } from "@/components/DataProvider";
import { Aviso, Badge, Shell } from "@/components/ui";
import { conciliar, parsearEstadoCuenta, type ResultadoParseo } from "@/lib/conciliacion";
import { estadoCuentaEjemplo } from "@/lib/seed";
import { soles } from "@/lib/util";
import type { Lote } from "@/lib/types";

const REGLAS: Record<string, string> = {
  reporte: "N° de operación reportado por el vecino",
  codigo: "Código de unidad en la descripción",
  nombre: "Nombre del propietario",
  manual: "Asignado manualmente",
};

function Contenido() {
  const { db, registrarConciliacion, asignar, eliminarMovimientos } = useData();
  const [archivo, setArchivo] = useState("");
  const [parseo, setParseo] = useState<ResultadoParseo | null>(null);
  const [lote, setLote] = useState<Lote | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [seleccion, setSeleccion] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const unidadPorId = useMemo(() => new Map(db.unidades.map((u) => [u.id, u])), [db.unidades]);
  const activas = db.unidades.filter((u) => u.activa).sort((a, b) => a.codigo.localeCompare(b.codigo));
  const porRevisar = db.movimientos.filter((m) => m.estado === "revisar");
  const duplicados = db.movimientos.filter((m) => m.estado === "duplicado");
  const reportesPend = db.reportes.filter((r) => r.estado === "pendiente");
  const lotes = [...db.lotes].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const movsLote = lote ? db.movimientos.filter((m) => m.loteId === lote.id) : [];

  const leerTexto = (nombre: string, texto: string) => {
    setArchivo(nombre);
    setLote(null);
    setParseo(parsearEstadoCuenta(texto));
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/\.(csv|txt)$/i.test(f.name)) {
      setArchivo(f.name);
      setParseo({ filas: [], errores: ["Formato no válido. Sube el estado de cuenta en formato CSV (en Excel: Archivo > Guardar como > CSV)."], cargosIgnorados: 0 });
      return;
    }
    if (f.size > 2_000_000) {
      setArchivo(f.name);
      setParseo({ filas: [], errores: ["El archivo supera 2 MB."], cargosIgnorados: 0 });
      return;
    }
    leerTexto(f.name, await f.text());
  };

  const ejecutar = async () => {
    if (!parseo?.filas.length) return;
    setGuardando(true);
    try {
      const r = conciliar(parseo.filas, db.unidades, db.movimientos, db.reportes, archivo, parseo.cargosIgnorados + parseo.errores.length);
      await registrarConciliacion(r);
      setLote(r.lote);
      setParseo(null);
      if (inputRef.current) inputRef.current.value = "";
    } finally {
      setGuardando(false);
    }
  };

  const descargarEjemplo = () => {
    const blob = new Blob([estadoCuentaEjemplo(db.unidades)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "estado_cuenta_ejemplo.csv";
    a.click();
  };

  return (
    <>
      <div>
        <h1 className="h1">Conciliar pagos</h1>
        <p className="muted">Sube el estado de cuenta de la cuenta del condominio. El sistema identifica a qué unidad corresponde cada abono y lo compara con la cuota.</p>
      </div>

      <div className="card space-y-3">
        <div className="h2">1. Cargar estado de cuenta (CSV)</div>
        <p className="text-sm text-slate-600">Columnas requeridas: <b>Fecha</b>, <b>Descripción</b>, <b>Monto</b> y <b>N° de operación</b>. Los cargos (montos negativos) se ignoran.</p>
        <div className="flex flex-wrap gap-2 items-center">
          <input ref={inputRef} type="file" accept=".csv,.txt" onChange={onFile} className="text-sm file:btn file:mr-2" />
          {db.config?.modoDemo && (
            <>
              <button className="btn" onClick={() => leerTexto("estado_cuenta_ejemplo.csv", estadoCuentaEjemplo(db.unidades))}>Usar estado de cuenta de ejemplo</button>
              <button className="btn" onClick={descargarEjemplo}>Descargar ejemplo</button>
            </>
          )}
        </div>

        {parseo && (
          <div className="space-y-2">
            <div className="text-sm">
              Archivo: <b>{archivo}</b> · {parseo.filas.length} abonos válidos · {parseo.cargosIgnorados} cargos ignorados
            </div>
            {parseo.errores.length > 0 && (
              <Aviso tipo="error">
                <div className="font-medium mb-1">Se encontraron {parseo.errores.length} problema(s):</div>
                <ul className="list-disc ml-5 max-h-32 overflow-auto">
                  {parseo.errores.slice(0, 20).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
                {parseo.filas.length > 0 && <div className="mt-1">Las filas con error no se procesarán.</div>}
              </Aviso>
            )}
            {parseo.filas.length > 0 && (
              <button className="btn-primary" disabled={guardando} onClick={ejecutar}>
                {guardando ? "Conciliando…" : `2. Conciliar ${parseo.filas.length} abonos`}
              </button>
            )}
          </div>
        )}
      </div>

      {lote && (
        <div className="card space-y-3">
          <div className="h2">Resultado de la conciliación</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
            <div><div className="muted">Abonos</div><div className="text-lg font-semibold">{lote.filas}</div></div>
            <div><div className="muted">Identificados</div><div className="text-lg font-semibold">{lote.automaticos} ({Math.round((lote.automaticos / Math.max(1, lote.filas - lote.duplicados)) * 100)}%)</div></div>
            <div><div className="muted">Por revisar</div><div className="text-lg font-semibold">{lote.revisar}</div></div>
            <div><div className="muted">Duplicados</div><div className="text-lg font-semibold">{lote.duplicados}</div></div>
            <div><div className="muted">Tiempo</div><div className="text-lg font-semibold">{(lote.ms / 1000).toFixed(2)} s</div></div>
          </div>
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr><th>Fecha</th><th>Descripción</th><th>Operación</th><th className="text-right">Monto</th><th>Unidad</th><th>Estado</th><th>Cómo se identificó</th></tr>
              </thead>
              <tbody>
                {movsLote.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap">{m.fecha}</td>
                    <td>{m.descripcion}</td>
                    <td className="tabular-nums">{m.operacion}</td>
                    <td className="text-right tabular-nums">{soles(m.monto)}</td>
                    <td>{m.unidadId ? unidadPorId.get(m.unidadId)?.codigo : "—"}</td>
                    <td><Badge estado={m.estado} /></td>
                    <td className="text-xs text-slate-500">{m.regla ? REGLAS[m.regla] : m.estado === "duplicado" ? "N° de operación ya registrado" : "Sin coincidencia"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card space-y-3">
        <div className="h2">Pagos por revisar ({porRevisar.length})</div>
        {porRevisar.length === 0 ? (
          <p className="muted">No hay pagos sin identificar.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead><tr><th>Fecha</th><th>Descripción</th><th>Operación</th><th className="text-right">Monto</th><th>Asignar a unidad</th></tr></thead>
              <tbody>
                {porRevisar.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap">{m.fecha}</td>
                    <td>{m.descripcion}</td>
                    <td className="tabular-nums">{m.operacion}</td>
                    <td className="text-right tabular-nums">{soles(m.monto)}</td>
                    <td>
                      <div className="flex gap-2">
                        <select className="input py-1 w-44" value={seleccion[m.id] || ""} onChange={(e) => setSeleccion({ ...seleccion, [m.id]: e.target.value })}>
                          <option value="">Elegir…</option>
                          {activas.map((u) => (
                            <option key={u.id} value={u.id}>{u.codigo} · {u.propietario}</option>
                          ))}
                        </select>
                        <button className="btn" disabled={!seleccion[m.id]} onClick={() => asignar(m.id, seleccion[m.id])}>Asignar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {duplicados.length > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm">{duplicados.length} movimiento(s) duplicado(s) registrados (no se suman a ningún pago).</div>
          <button className="btn-danger" onClick={() => eliminarMovimientos(duplicados.map((d) => d.id))}>Eliminar duplicados</button>
        </div>
      )}

      <div className="card space-y-2">
        <div className="h2">Pagos reportados por vecinos y aún no vistos en el banco ({reportesPend.length})</div>
        {reportesPend.length === 0 ? (
          <p className="muted">Ninguno pendiente.</p>
        ) : (
          <table className="tabla">
            <thead><tr><th>Unidad</th><th>Fecha</th><th>Operación</th><th className="text-right">Monto</th></tr></thead>
            <tbody>
              {reportesPend.map((r) => (
                <tr key={r.id}>
                  <td>{unidadPorId.get(r.unidadId)?.codigo}</td>
                  <td>{r.fecha}</td>
                  <td className="tabular-nums">{r.operacion}</td>
                  <td className="text-right tabular-nums">{soles(r.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-xs text-slate-500">Se verifican solos cuando el n° de operación aparece en el siguiente estado de cuenta.</p>
      </div>

      <div className="card space-y-2">
        <div className="h2">Historial de conciliaciones</div>
        {lotes.length === 0 ? (
          <p className="muted">Aún no se ha cargado ningún estado de cuenta.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead><tr><th>Fecha</th><th>Archivo</th><th>Abonos</th><th>% automático</th><th>Por revisar</th><th>Duplicados</th><th>Tiempo</th></tr></thead>
              <tbody>
                {lotes.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap">{new Date(l.fecha).toLocaleString("es-PE")}</td>
                    <td>{l.archivo}</td>
                    <td>{l.filas}</td>
                    <td>{Math.round((l.automaticos / Math.max(1, l.filas - l.duplicados)) * 100)}%</td>
                    <td>{l.revisar}</td>
                    <td>{l.duplicados}</td>
                    <td>{(l.ms / 1000).toFixed(2)} s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
