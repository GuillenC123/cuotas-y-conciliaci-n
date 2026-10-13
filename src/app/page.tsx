"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/components/DataProvider";
import { Aviso, Cargando } from "@/components/ui";

export default function Login() {
  const { cargando, sesion, loginAdmin, loginVecino, cfg, db, error } = useData();
  const router = useRouter();
  const [tab, setTab] = useState<"vecino" | "admin">("vecino");
  const [codigo, setCodigo] = useState("");
  const [pin, setPin] = useState("");
  const [clave, setClave] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!cargando && sesion) router.replace(sesion.rol === "admin" ? "/admin" : "/vecino");
  }, [cargando, sesion, router]);

  if (cargando) return <Cargando />;

  const entrar = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    if (tab === "admin") {
      if (!clave.trim()) return setMsg("Ingresa la clave de administrador.");
      if (!loginAdmin(clave)) return setMsg("Clave incorrecta.");
    } else {
      if (!codigo.trim() || !pin.trim()) return setMsg("Ingresa el código de tu unidad y tu PIN.");
      if (!/^\d{4}$/.test(pin.trim())) return setMsg("El PIN debe tener 4 dígitos.");
      if (!loginVecino(codigo, pin)) return setMsg("Unidad o PIN incorrectos.");
    }
  };

  const ejemplo = db.unidades[0];

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="text-xs uppercase tracking-wide text-teal-700 font-semibold">Cuotas y conciliación de pagos</div>
          <h1 className="text-xl font-semibold mt-1">{cfg.nombre}</h1>
          {cfg.ruc && <div className="muted">RUC {cfg.ruc} · {cfg.distrito}</div>}
        </div>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <form onSubmit={entrar} className="card space-y-3" noValidate>
          <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-md p-1">
            {(["vecino", "admin"] as const).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => {
                  setTab(t);
                  setMsg("");
                }}
                className={`rounded py-1.5 text-sm ${tab === t ? "bg-white shadow-sm font-medium" : "text-slate-600"}`}
              >
                {t === "vecino" ? "Soy vecino" : "Administrador"}
              </button>
            ))}
          </div>
          {tab === "vecino" ? (
            <>
              <div>
                <label className="label" htmlFor="codigo">Código de unidad</label>
                <input id="codigo" className="input" placeholder="Ej. A-101" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="pin">PIN (4 dígitos)</label>
                <input id="pin" className="input" inputMode="numeric" maxLength={4} type="password" value={pin} onChange={(e) => setPin(e.target.value)} />
              </div>
            </>
          ) : (
            <div>
              <label className="label" htmlFor="clave">Clave de administrador</label>
              <input id="clave" className="input" type="password" value={clave} onChange={(e) => setClave(e.target.value)} />
            </div>
          )}
          {msg && <Aviso tipo="error">{msg}</Aviso>}
          <button className="btn-primary w-full" type="submit">Ingresar</button>
        </form>
        {cfg.modoDemo && ejemplo && (
          <div className="card text-sm space-y-1">
            <div className="font-medium">Credenciales de prueba</div>
            <div>Administrador: clave <code className="bg-slate-100 px-1 rounded">{cfg.claveAdmin}</code></div>
            <div>
              Vecino: unidad <code className="bg-slate-100 px-1 rounded">{ejemplo.codigo}</code>, PIN <code className="bg-slate-100 px-1 rounded">{ejemplo.pin}</code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
