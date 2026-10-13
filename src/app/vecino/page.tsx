"use client";
import { useMemo, useState } from "react";
import { useData } from "@/components/DataProvider";
import { Aviso, Badge, Shell, Stat } from "@/components/ui";
import { aplicarPagos, primerPeriodo } from "@/lib/morosidad";
import { hoyISO, nombrePeriodo, soles } from "@/lib/util";

function Contenido() {
  const { db, cfg, sesion, reportarPago } = useData();
  const unidadId = sesion?.rol === "vecino" ? sesion.unidadId : "";
  const unidad = db.unidades.find((u) => u.id === unidadId);
  // Solo se usan los movimientos de esta unidad (el vecino no ve datos de otras unidades)
  const propios = useMemo(() => db.movimientos.filter((m) => m.unidadId === unidadId), [db.movimientos, unidadId]);
  const cuenta = useMemo(() => (unidad ? aplicarPagos(unidad, propios, cfg, primerPeriodo(db.movimientos)) : { periodos: [], saldoFavor: 0 }), [unidad, propios, cfg, db.movimientos]);
  const periodos = useMemo(() => [...cuenta.periodos].reverse(), [cuenta]);
  const misReportes = db.reportes.filter((r) => r.unidadId === unidadId).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  const [f, setF] = useState({ fecha: hoyISO(), monto: unidad ? String(unidad.cuota) : "", operacion: "" });
  const [msg, setMsg] = useState<{ t: "error" | "ok"; m: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!unidad) return <Aviso tipo="error">No se encontró la unidad.</Aviso>;
  const deuda = periodos.filter((p) => p.estado === "pendiente" || p.estado === "parcial").reduce((s, p) => s + (p.cuota - p.pagado), 0);
  const actual = periodos[0];

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const monto = Number(f.monto);
    const op = f.operacion.trim();
    if (!f.fecha || !op || !f.monto) return setMsg({ t: "error", m: "Completa la fecha, el monto y el número de operación." });
    if (!/^[A-Za-z0-9-]{4,20}$/.test(op)) return setMsg({ t: "error", m: "El número de operación debe tener entre 4 y 20 caracteres (letras o números)." });
    if (!Number.isFinite(monto) || monto <= 0) return setMsg({ t: "error", m: "El monto debe ser mayor a 0." });
    if (f.fecha > hoyISO()) return setMsg({ t: "error", m: "La fecha no puede ser futura." });
    if (db.reportes.some((r) => r.operacion === op) || db.movimientos.some((m) => m.operacion === op && m.unidadId === unidadId)) {
      return setMsg({ t: "error", m: "Ese número de operación ya fue registrado." });
    }
    setEnviando(true);
    try {
      await reportarPago({ unidadId, fecha: f.fecha, monto, operacion: op });
      setMsg({ t: "ok", m: "Pago reportado. Se confirmará automáticamente cuando aparezca en el estado de cuenta del banco." });
      setF({ ...f, operacion: "" });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <div>
        <h1 className="h1">Mi estado de cuenta</h1>
        <p className="muted">Unidad {unidad.codigo} · cuota mensual {soles(unidad.cuota)} · vence el día {cfg.diaVencimiento}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat titulo="Deuda pendiente" valor={soles(deuda)} nota={deuda > 0 ? "Incluye meses pendientes o parciales" : cuenta.saldoFavor > 0 ? `Estás al día · saldo a favor ${soles(cuenta.saldoFavor)}` : "Estás al día"} />
        <Stat titulo={`Cuota de ${actual ? nombrePeriodo(actual.periodo, true) : "este mes"}`} valor={actual ? (actual.estado === "pagado" ? "Pagada" : actual.estado === "por_vencer" ? "Por vencer" : actual.estado === "parcial" ? "Parcial" : "Pendiente") : "—"} nota={actual?.fechaPago ? `Confirmada con el banco el ${actual.fechaPago}` : undefined} />
        <Stat titulo="Pagos confirmados" valor={String(propios.filter((m) => m.estado !== "duplicado" && m.estado !== "revisar").length)} nota="Verificados contra el estado de cuenta" />
      </div>

      <div className="card overflow-x-auto">
        <div className="h2">Historial por mes</div>
        <p className="text-xs text-slate-500 mb-2">Cada pago se aplica primero al mes más antiguo que esté pendiente.</p>
        <table className="tabla">
          <thead><tr><th>Mes</th><th className="text-right">Cuota</th><th className="text-right">Pagado</th><th>Fecha de pago</th><th>Estado</th></tr></thead>
          <tbody>
            {periodos.map((p) => (
              <tr key={p.periodo}>
                <td>{nombrePeriodo(p.periodo, true)}</td>
                <td className="text-right tabular-nums">{soles(p.cuota)}</td>
                <td className="text-right tabular-nums">{soles(p.pagado)}</td>
                <td>{p.fechaPago ? `${p.fechaPago}${p.diasRetraso ? ` (${p.diasRetraso} días tarde)` : ""}` : "—"}</td>
                <td><Badge estado={p.estado} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={enviar} className="card space-y-3" noValidate>
        <div>
          <div className="h2">Reportar un pago</div>
          <p className="muted">Si ya transferiste o yapeaste a la cuenta del condominio, ingresa el número de operación para que tu pago se confirme más rápido.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div><label className="label">Fecha del pago</label><input type="date" className="input" value={f.fecha} max={hoyISO()} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></div>
          <div><label className="label">Monto (S/)</label><input className="input" inputMode="decimal" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} /></div>
          <div><label className="label">N° de operación</label><input className="input" value={f.operacion} onChange={(e) => setF({ ...f, operacion: e.target.value })} placeholder="Figura en tu voucher" /></div>
        </div>
        {msg && <Aviso tipo={msg.t}>{msg.m}</Aviso>}
        <button className="btn-primary" disabled={enviando} type="submit">{enviando ? "Enviando…" : "Reportar pago"}</button>
        {misReportes.length > 0 && (
          <table className="tabla">
            <thead><tr><th>Fecha</th><th>Operación</th><th className="text-right">Monto</th><th>Estado</th></tr></thead>
            <tbody>
              {misReportes.map((r) => (
                <tr key={r.id}><td>{r.fecha}</td><td className="tabular-nums">{r.operacion}</td><td className="text-right tabular-nums">{soles(r.monto)}</td><td><Badge estado={r.estado} /></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </form>
    </>
  );
}

export default function Page() {
  return (
    <Shell rol="vecino">
      <Contenido />
    </Shell>
  );
}
