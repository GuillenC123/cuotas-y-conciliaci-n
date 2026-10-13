// Tipos principales del sistema de cuotas y conciliación

export interface Config {
  id: string; // siempre "main"
  nombre: string;
  ruc: string;
  distrito: string;
  cuota: number; // cuota mensual por defecto (S/)
  diaVencimiento: number; // día del mes en que vence la cuota
  claveAdmin: string;
  modoDemo: boolean; // true = datos de ejemplo
}

export interface Unidad {
  id: string;
  codigo: string; // ej. "A-101"
  propietario: string;
  telefono: string;
  cuota: number;
  pin: string; // PIN de acceso del vecino (demo)
  activa: boolean;
}

export type EstadoMovimiento =
  | "conciliado" // monto igual a la cuota
  | "parcial" // monto menor a la cuota
  | "excedente" // monto mayor a la cuota
  | "duplicado" // n° de operación repetido
  | "revisar"; // no se pudo identificar la unidad

export type ReglaMatch = "reporte" | "codigo" | "nombre" | "manual" | null;

export interface Movimiento {
  id: string;
  fecha: string; // YYYY-MM-DD
  descripcion: string;
  monto: number;
  operacion: string; // n° de operación bancaria
  periodo: string; // YYYY-MM al que se imputa el pago
  unidadId: string | null;
  estado: EstadoMovimiento;
  regla: ReglaMatch;
  loteId: string;
  creadoEn: string;
}

export interface Lote {
  id: string;
  archivo: string;
  fecha: string; // fecha de importación ISO
  filas: number; // abonos procesados
  automaticos: number; // conciliados sin intervención
  revisar: number;
  duplicados: number;
  ignorados: number; // cargos / filas inválidas
  ms: number; // tiempo que tomó la conciliación
}

export interface ReportePago {
  id: string;
  unidadId: string;
  fecha: string;
  monto: number;
  operacion: string;
  estado: "pendiente" | "verificado";
  creadoEn: string;
}

export interface Egreso {
  id: string;
  fecha: string;
  concepto: string;
  categoria: string;
  monto: number;
}

export interface DB {
  config: Config | null;
  unidades: Unidad[];
  movimientos: Movimiento[];
  lotes: Lote[];
  reportes: ReportePago[];
  egresos: Egreso[];
}

export type Tabla = Exclude<keyof DB, "config"> | "config";
