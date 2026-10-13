"use client";
import { useState } from "react";
import { useData } from "@/components/DataProvider";
import { Aviso, Shell } from "@/components/ui";

function Contenido() {
  const { cfg, guardarConfig, reiniciarDemo, vaciarDatos, modo } = useData();
  const [f, setF] = useState({ ...cfg, cuota: String(cfg.cuota), diaVencimiento: String(cfg.diaVencimiento) });
  const [msg, setMsg] = useState<{ t: "error" | "ok"; m: string } | null>(null);
  const [confirmar, setConfirmar] = useState<"" | "demo" | "vaciar">("");

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const cuota = Number(f.cuota);
    const dia = Number(f.diaVencimiento);
    if (!f.nombre.trim()) return setMsg({ t: "error", m: "El nombre es obligatorio." });
    if (f.ruc && !/^\d{11}$/.test(f.ruc.trim())) return setMsg({ t: "error", m: "El RUC debe tener 11 dígitos." });
    if (!Number.isFinite(cuota) || cuota <= 0) return setMsg({ t: "error", m: "La cuota debe ser mayor a 0." });
    if (!Number.isInteger(dia) || dia < 1 || dia > 28) return setMsg({ t: "error", m: "El día de vencimiento debe estar entre 1 y 28." });
    if (f.claveAdmin.trim().length < 6) return setMsg({ t: "error", m: "La clave de administrador debe tener al menos 6 caracteres." });
    await guardarConfig({ ...cfg, nombre: f.nombre.trim(), ruc: f.ruc.trim(), distrito: f.distrito.trim(), cuota, diaVencimiento: dia, claveAdmin: f.claveAdmin.trim() });
    setMsg({ t: "ok", m: "Configuración guardada." });
  };

  return (
    <>
      <h1 className="h1">Configuración</h1>
      <form onSubmit={guardar} className="card grid grid-cols-1 sm:grid-cols-2 gap-3" noValidate>
        <div className="sm:col-span-2"><label className="label">Nombre del condominio / junta de propietarios</label><input className="input" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
        <div><label className="label">RUC</label><input className="input" maxLength={11} value={f.ruc} onChange={(e) => setF({ ...f, ruc: e.target.value })} /></div>
        <div><label className="label">Distrito</label><input className="input" value={f.distrito} onChange={(e) => setF({ ...f, distrito: e.target.value })} /></div>
        <div><label className="label">Cuota mensual por defecto (S/)</label><input className="input" inputMode="decimal" value={f.cuota} onChange={(e) => setF({ ...f, cuota: e.target.value })} /></div>
        <div><label className="label">Día de vencimiento</label><input className="input" inputMode="numeric" value={f.diaVencimiento} onChange={(e) => setF({ ...f, diaVencimiento: e.target.value })} /></div>
        <div><label className="label">Clave de administrador</label><input className="input" value={f.claveAdmin} onChange={(e) => setF({ ...f, claveAdmin: e.target.value })} /></div>
        <div className="flex items-end"><button className="btn-primary" type="submit">Guardar</button></div>
      </form>
      {msg && <Aviso tipo={msg.t}>{msg.m}</Aviso>}

      <div className="card space-y-3">
        <div className="h2">Datos</div>
        <p className="text-sm text-slate-600">
          Almacenamiento actual: <b>{modo === "supabase" ? "Supabase (PostgreSQL en la nube)" : "LocalStorage de este navegador"}</b>.
          {cfg.modoDemo ? " Se están usando datos de ejemplo." : " Se están usando datos reales."}
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => setConfirmar("demo")}>Restaurar datos de ejemplo</button>
          <button className="btn-danger" onClick={() => setConfirmar("vaciar")}>Empezar con datos reales (borra todo)</button>
        </div>
        {confirmar && (
          <Aviso tipo="error">
            <div className="mb-2">{confirmar === "demo" ? "Se borrarán los datos actuales y se cargarán los de ejemplo." : "Se borrarán unidades, pagos y egresos. Luego deberás cargar el padrón real."} ¿Continuar?</div>
            <div className="flex gap-2">
              <button
                className="btn-danger"
                onClick={async () => {
                  if (confirmar === "demo") await reiniciarDemo();
                  else await vaciarDatos();
                  setConfirmar("");
                  setMsg({ t: "ok", m: "Datos actualizados. Si cambiaste la clave, vuelve a ingresar." });
                }}
              >
                Sí, continuar
              </button>
              <button className="btn" onClick={() => setConfirmar("")}>Cancelar</button>
            </div>
          </Aviso>
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
