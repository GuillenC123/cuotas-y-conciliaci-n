export function uid(prefix = ""): string {
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${r}`;
}

export function normalizar(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function soles(n: number): string {
  return "S/\u00a0" + (n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function periodoDe(fecha: string): string {
  return fecha.slice(0, 7);
}

export function periodoActual(): string {
  return periodoDe(hoyISO());
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

export function nombrePeriodo(p: string, largo = false): string {
  const [y, m] = p.split("-").map(Number);
  return largo ? `${MESES_LARGO[m - 1]} ${y}` : `${MESES[m - 1]} ${y}`;
}

export function sumarMeses(p: string, n: number): string {
  const [y, m] = p.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function rangoPeriodos(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let p = desde;
  while (p <= hasta && out.length < 120) {
    out.push(p);
    p = sumarMeses(p, 1);
  }
  return out;
}

export function descargarCSV(nombre: string, filas: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = filas.map((f) => f.map(esc).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
