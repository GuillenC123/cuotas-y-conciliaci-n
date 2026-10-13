"use client";
import { useState } from "react";
import Papa from "papaparse";
import { useData } from "@/components/DataProvider";
import { Aviso, Shell } from "@/components/ui";
import { soles } from "@/lib/util";
import type { Unidad } from "@/lib/types";

const pinAleatorio = () => String(1000 + Math.floor(Math.random() * 9000));

function Contenido() {
  const { db, cfg, guardarUnidad, eliminarUnidad } = useData();
  const vacio = { codigo: "", propietario: "", telefono: "", cuota: String(cfg.cuota), pin: pinAleatorio() };
  const [f, setF] = useState(vacio);
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: "error" | "ok"; m: string } | null>(null);
  const [verInactivas, setVerInactivas] = useState(false);
  const lista = db.unidades.filter((u) => verInactivas || u.activa).sort((a, b) => a.codigo.localeCompare(b.codigo));

  const validar = (codigo: string, propietario: string, cuota: number, pin: string, id: string | null): string | null => {
    if (!codigo || !propietario) return "El código y el propietario son obligatorios.";
    if (!/^[A-Z0-9]{1,4}-?[A-Z0-9]{1,5}$/.test(codigo)) return "Código no válido. Usa un formato como A-101 o 305.";
    if (db.unidades.some((u) => u.codigo === codigo && u.id !== id)) return `Ya existe la unidad ${codigo}.`;
    if (!Number.isFinite(cuota) || cuota <= 0) return "La cuota debe ser mayor a 0.";
    if (!/^\d{4}$/.test(pin)) return "El PIN debe tener 4 dígitos.";
    return null;
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const codigo = f.codigo.trim().toUpperCase();
    const cuota = Number(f.cuota);
    const err = validar(codigo, f.propietario.trim(), cuota, f.pin.trim(), editId);
    if (err) return setMsg({ t: "error", m: err });
    const previa = db.unidades.find((u) => u.id === editId);
    const u: Unidad = { id: editId || `U-${codigo}`, codigo, propietario: f.propietario.trim(), telefono: f.telefono.trim(), cuota, pin: f.pin.trim(), activa: previa ? previa.activa : true };
    await guardarUnidad(u);
    setMsg({ t: "ok", m: editId ? `Unidad ${codigo} actualizada.` : `Unidad ${codigo} registrada. PIN del vecino: ${u.pin}` });
    setF({ ...vacio, pin: pinAleatorio() });
    setEditId(null);
  };

  const importar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const res = Papa.parse<Record<string, string>>((await file.text()).trim(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
    if (!res.meta.fields?.includes("codigo") || !res.meta.fields?.includes("propietario")) {
      return setMsg({ t: "error", m: "El CSV debe tener las columnas: codigo, propietario (opcionales: telefono, cuota)." });
    }
    let ok = 0;
    const errores: string[] = [];
    const nuevas: Unidad[] = [];
    for (const [i, row] of res.data.entries()) {
      const codigo = (row.codigo || "").trim().toUpperCase();
      const cuota = row.cuota ? Number(row.cuota) : cfg.cuota;
      const existente = db.unidades.find((u) => u.codigo === codigo);
      const pin = existente?.pin || pinAleatorio();
      const err = validar(codigo, (row.propietario || "").trim(), cuota, pin, existente?.id || null) || (nuevas.some((n) => n.codigo === codigo) ? "Código repetido en el archivo." : null);
      if (err) {
        errores.push(`Fila ${i + 2}: ${err}`);
        continue;
      }
      nuevas.push({ id: existente?.id || `U-${codigo}`, codigo, propietario: row.propietario.trim(), telefono: (row.telefono || "").trim(), cuota, pin, activa: true });
      ok++;
    }
    for (const u of nuevas) await guardarUnidad(u);
    setMsg({ t: errores.length ? "error" : "ok", m: `${ok} unidad(es) importadas.${errores.length ? " Errores: " + errores.slice(0, 5).join(" ") : ""}` });
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">Padrón de unidades</h1>
          <p className="muted">{db.unidades.filter((u) => u.activa).length} unidades activas. El PIN es el acceso del vecino a su estado de cuenta.</p>
        </div>
        <label className="btn cursor-pointer">
          Importar padrón (CSV)
          <input type="file" accept=".csv" className="hidden" onChange={importar} />
        </label>
      </div>
      <form onSubmit={guardar} className="card grid grid-cols-1 sm:grid-cols-[110px_1fr_130px_100px_90px_auto] gap-2 items-end" noValidate>
        <div><label className="label">Código</label><input className="input" placeholder="A-101" value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} /></div>
        <div><label className="label">Propietario</label><input className="input" value={f.propietario} onChange={(e) => setF({ ...f, propietario: e.target.value })} /></div>
        <div><label className="label">Teléfono</label><input className="input" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></div>
        <div><label className="label">Cuota (S/)</label><input className="input" inputMode="decimal" value={f.cuota} onChange={(e) => setF({ ...f, cuota: e.target.value })} /></div>
        <div><label className="label">PIN</label><input className="input" maxLength={4} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value })} /></div>
        <div className="flex gap-2">
          <button className="btn-primary" type="submit">{editId ? "Guardar" : "Agregar"}</button>
          {editId && <button type="button" className="btn" onClick={() => { setEditId(null); setF({ ...vacio, pin: pinAleatorio() }); }}>Cancelar</button>}
        </div>
      </form>
      {msg && <Aviso tipo={msg.t}>{msg.m}</Aviso>}
      <div className="card overflow-x-auto space-y-2">
        <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={verInactivas} onChange={(e) => setVerInactivas(e.target.checked)} /> Mostrar unidades desactivadas</label>
        <table className="tabla">
          <thead><tr><th>Código</th><th>Propietario</th><th>Teléfono</th><th className="text-right">Cuota</th><th>PIN</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {lista.map((u) => (
              <tr key={u.id} className={u.activa ? "" : "opacity-50"}>
                <td className="font-medium">{u.codigo}</td>
                <td>{u.propietario}</td>
                <td>{u.telefono}</td>
                <td className="text-right tabular-nums">{soles(u.cuota)}</td>
                <td className="tabular-nums">{u.pin}</td>
                <td>{u.activa ? "Activa" : "Desactivada"}</td>
                <td className="text-right whitespace-nowrap">
                  <button className="btn py-1" onClick={() => { setEditId(u.id); setF({ codigo: u.codigo, propietario: u.propietario, telefono: u.telefono, cuota: String(u.cuota), pin: u.pin }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Editar</button>{" "}
                  {u.activa ? (
                    <button className="btn-danger py-1" onClick={() => eliminarUnidad(u.id)}>Desactivar</button>
                  ) : (
                    <button className="btn py-1" onClick={() => guardarUnidad({ ...u, activa: true })}>Reactivar</button>
                  )}
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
