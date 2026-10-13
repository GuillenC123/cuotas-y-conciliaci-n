"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useData } from "./DataProvider";

const COLORES: Record<string, string> = {
  conciliado: "bg-emerald-50 text-emerald-800 border-emerald-200",
  pagado: "bg-emerald-50 text-emerald-800 border-emerald-200",
  verificado: "bg-emerald-50 text-emerald-800 border-emerald-200",
  parcial: "bg-amber-50 text-amber-800 border-amber-200",
  excedente: "bg-sky-50 text-sky-800 border-sky-200",
  por_vencer: "bg-slate-50 text-slate-600 border-slate-200",
  pendiente: "bg-red-50 text-red-700 border-red-200",
  revisar: "bg-orange-50 text-orange-800 border-orange-200",
  duplicado: "bg-slate-100 text-slate-600 border-slate-300",
};
const TEXTOS: Record<string, string> = {
  conciliado: "Conciliado",
  pagado: "Pagado",
  verificado: "Verificado",
  parcial: "Parcial",
  excedente: "Pagó de más",
  por_vencer: "Por vencer",
  pendiente: "Pendiente",
  revisar: "Por revisar",
  duplicado: "Duplicado",
};

export function Badge({ estado }: { estado: string }) {
  return <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${COLORES[estado] || "bg-slate-50 border-slate-200"}`}>{TEXTOS[estado] || estado}</span>;
}

export function Stat({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="card">
      <div className="text-xs text-slate-500">{titulo}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{valor}</div>
      {nota && <div className="text-xs text-slate-500 mt-1">{nota}</div>}
    </div>
  );
}

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "error" | "ok"; children: React.ReactNode }) {
  const c = tipo === "error" ? "bg-red-50 border-red-200 text-red-800" : tipo === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-slate-50 border-slate-200 text-slate-700";
  return <div className={`rounded-md border px-3 py-2 text-sm ${c}`}>{children}</div>;
}

export function Cargando() {
  return <div className="p-8 text-center muted">Cargando…</div>;
}

const NAV_ADMIN = [
  ["/admin", "Resumen"],
  ["/admin/conciliar", "Conciliar pagos"],
  ["/admin/morosidad", "Morosidad"],
  ["/reporte", "Reporte mensual"],
  ["/admin/egresos", "Egresos"],
  ["/admin/unidades", "Padrón"],
  ["/admin/datos", "Datos APF3"],
  ["/admin/configuracion", "Configuración"],
];
const NAV_VECINO = [
  ["/vecino", "Mi estado de cuenta"],
  ["/reporte", "Reporte mensual"],
];

export function Shell({ rol, children }: { rol: "admin" | "vecino" | "cualquiera"; children: React.ReactNode }) {
  const { sesion, cargando, logout, cfg, db, error } = useData();
  const router = useRouter();
  const path = usePathname();
  const [menu, setMenu] = useState(false);

  const permitido = sesion && (rol === "cualquiera" || sesion.rol === rol);
  useEffect(() => {
    if (!cargando && !permitido) router.replace("/");
  }, [cargando, permitido, router]);

  if (cargando || !permitido) return <Cargando />;
  const nav = sesion!.rol === "admin" ? NAV_ADMIN : NAV_VECINO;
  const unidad = sesion!.rol === "vecino" ? db.unidades.find((u) => u.id === (sesion as { unidadId: string }).unidadId) : null;

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold truncate">{cfg.nombre}</div>
            <div className="text-xs text-slate-500 truncate">
              {sesion!.rol === "admin" ? "Administración" : `Unidad ${unidad?.codigo} · ${unidad?.propietario}`}
              {cfg.ruc ? ` · RUC ${cfg.ruc}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn md:hidden" onClick={() => setMenu(!menu)} aria-label="Menú">☰</button>
            <button
              className="btn"
              onClick={() => {
                logout();
                router.replace("/");
              }}
            >
              Salir
            </button>
          </div>
        </div>
        <nav className={`max-w-6xl mx-auto px-4 pb-2 gap-1 overflow-x-auto ${menu ? "flex flex-col" : "hidden"} md:flex md:flex-row`}>
          {nav.map(([href, txt]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenu(false)}
              className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap ${path === href ? "bg-teal-50 text-teal-800 font-medium" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {txt}
            </Link>
          ))}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        {error && <Aviso tipo="error">{error}</Aviso>}
        {children}
      </main>
      {cfg.modoDemo && (
        <footer className="max-w-6xl mx-auto px-4 pb-6 text-xs text-slate-400">
          Datos de demostración: los propietarios, pagos y montos mostrados son ficticios.
        </footer>
      )}
    </div>
  );
}
