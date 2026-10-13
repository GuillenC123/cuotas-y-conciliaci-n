"use client";
import { useState } from "react";
import { useData } from "@/components/DataProvider";
import { Aviso, Shell } from "@/components/ui";
import { hoyISO, soles, uid } from "@/lib/util";
import type { Egreso } from "@/lib/types";

const CATEGORIAS = ["Vigilancia", "Limpieza", "Servicios", "Mantenimiento", "Administración", "Varios"];

function Contenido() {
  const { db, guardarEgreso, eliminarEgreso } = useData();
  const vacio = { fecha: hoyISO(), concepto: "", categoria: "Vigilancia", monto: "" };
  const [f, setF] = useState(vacio);
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: "error" | "ok"; m: string } | null>(null);
  const lista = [...db.egresos].sort((a, b) => b.fecha.localeCompare(a.fecha));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const monto = Number(f.monto);
    if (!f.fecha || !f.concepto.trim()) return setMsg({ t: "error", m: "Completa la fecha y el concepto." });
    if (!Number.isFinite(monto) || monto <= 0) return setMsg({ t: "error", m: "El monto debe ser mayor a 0." });
    const eg: Egreso = { id: editId || uid("E"), fecha: f.fecha, concepto: f.concepto.trim(), categoria: f.categoria, monto: Math.round(monto * 100) / 100 };
    await guardarEgreso(eg);
    setMsg({ t: "ok", m: editId ? "Egreso actualizado." : "Egreso registrado." });
    setF(vacio);
    setEditId(null);
  };

  return (
    <>
      <div>
        <h1 className="h1">Egresos</h1>
        <p className="muted">Gastos pagados con las cuotas (vigilancia, limpieza, servicios). Aparecen en el reporte mensual.</p>
      </div>
      <form onSubmit={guardar} className="card grid grid-cols-1 sm:grid-cols-[140px_1fr_160px_120px_auto] gap-2 items-end" noValidate>
        <div><label className="label">Fecha</label><input type="date" className="input" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></div>
        <div><label className="label">Concepto</label><input className="input" value={f.concepto} onChange={(e) => setF({ ...f, concepto: e.target.value })} placeholder="Ej. Servicio de vigilancia octubre" /></div>
        <div>
          <label className="label">Categoría</label>
          <select className="input" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
            {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div><label className="label">Monto (S/)</label><input className="input" inputMode="decimal" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} /></div>
        <div className="flex gap-2">
          <button className="btn-primary" type="submit">{editId ? "Guardar" : "Agregar"}</button>
          {editId && <button type="button" className="btn" onClick={() => { setEditId(null); setF(vacio); }}>Cancelar</button>}
        </div>
      </form>
      {msg && <Aviso tipo={msg.t}>{msg.m}</Aviso>}
      <div className="card overflow-x-auto">
        <table className="tabla">
          <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th className="text-right">Monto</th><th /></tr></thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap">{e.fecha}</td>
                <td>{e.concepto}</td>
                <td>{e.categoria}</td>
                <td className="text-right tabular-nums">{soles(e.monto)}</td>
                <td className="text-right whitespace-nowrap">
                  <button className="btn py-1" onClick={() => { setEditId(e.id); setF({ fecha: e.fecha, concepto: e.concepto, categoria: e.categoria, monto: String(e.monto) }); }}>Editar</button>{" "}
                  <button className="btn-danger py-1" onClick={() => eliminarEgreso(e.id)}>Eliminar</button>
                </td>
              </tr>
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
