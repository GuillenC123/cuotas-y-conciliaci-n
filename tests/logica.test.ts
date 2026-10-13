import { dbDemo, estadoCuentaEjemplo } from "../src/lib/seed";
import { parsearEstadoCuenta, conciliar, parsearMonto, parsearFecha } from "../src/lib/conciliacion";
import { tablaMorosidad, reporteMensual, datasetAPF3, aplicarPagos } from "../src/lib/morosidad";
import { periodoActual, sumarMeses } from "../src/lib/util";
import assert from "node:assert";

const db = dbDemo();
const csv = estadoCuentaEjemplo(db.unidades);
const p = parsearEstadoCuenta(csv);
console.log("filas", p.filas.length, "errores", p.errores, "cargos", p.cargosIgnorados);
const r = conciliar(p.filas, db.unidades, db.movimientos, db.reportes, "ejemplo.csv", p.cargosIgnorados);
console.log("lote", r.lote);
const porEstado: Record<string, number> = {};
const porRegla: Record<string, number> = {};
r.movimientos.forEach(m => { porEstado[m.estado]=(porEstado[m.estado]||0)+1; porRegla[String(m.regla)]=(porRegla[String(m.regla)]||0)+1; });
console.log(porEstado, porRegla, "reportes verificados", r.reportesVerificados);
console.log(r.movimientos.filter(m=>m.estado==="revisar").map(m=>m.descripcion));
assert.ok(r.reportesVerificados.includes("R-demo-1"));
assert.equal(r.lote.duplicados, 1);
// validaciones
assert.deepEqual(parsearEstadoCuenta("").errores, ["El archivo está vacío."]);
assert.match(parsearEstadoCuenta("a,b\n1,2").errores[0], /Faltan columnas/);
const malo = parsearEstadoCuenta("Fecha,Descripcion,Monto,Operacion\n32/13/2026,X,abc,1\n01/10/2026,Y,100,");
console.log(malo.errores);
assert.equal(malo.errores.length, 2);
assert.equal(parsearMonto("S/ 1,280.50"), 1280.5);
assert.equal(parsearMonto("1.280,50"), 1280.5);
assert.equal(parsearFecha("2026-02-30"), null);
// re-importar el mismo archivo => todo duplicado
const r2 = conciliar(p.filas, db.unidades, [...db.movimientos, ...r.movimientos], [], "otra vez.csv", 0);
assert.equal(r2.lote.duplicados, r2.lote.filas);
const movs = [...db.movimientos, ...r.movimientos];
const mor = tablaMorosidad(db.unidades, movs, db.config!);
console.log("al dia", mor.filter(f=>f.alDia).length, "morosos", mor.filter(f=>!f.alDia).length, "deuda total", mor.reduce((s,f)=>s+f.deuda,0));
console.log(reporteMensual(sumarMeses(periodoActual(),-1), db.unidades, movs, db.egresos));
const ds = datasetAPF3(db.unidades, movs, db.config!);
console.log("dataset filas", ds.length, ds.slice(0,3));
console.log("OK");

// Un pago atrasado se aplica primero al mes más antiguo pendiente
{
  const actual = periodoActual();
  const m2 = sumarMeses(actual, -2), m1 = sumarMeses(actual, -1);
  const u = { id: "U-T", codigo: "T-1", propietario: "Prueba", telefono: "", cuota: 280, pin: "1111", activa: true };
  const mk = (id: string, fecha: string, monto: number) => ({ id, fecha, descripcion: "", monto, operacion: id, periodo: fecha.slice(0, 7), unidadId: "U-T", estado: "conciliado", regla: "codigo", loteId: "x", creadoEn: "" }) as any;
  // pagó m2 a tiempo, no pagó m1, y en el mes actual pagó dos cuotas + 20 de más
  const movs = [mk("a", `${m2}-05`, 280), mk("b", `${actual}-03`, 280), mk("c", `${actual}-04`, 300)];
  const cfgT = { ...db.config, diaVencimiento: 10 };
  const res = aplicarPagos(u, movs, cfgT, m2);
  assert.deepEqual(res.periodos.map(p => p.estado), ["pagado", "pagado", "pagado"]);
  assert.equal(res.periodos[1].fechaPago, `${actual}-03`); // el mes atrasado se cubrió con el pago de este mes
  assert.equal(res.saldoFavor, 20);
  const solo = aplicarPagos(u, [movs[0], movs[1]], cfgT, m2);
  assert.equal(solo.periodos[1].estado, "pagado");
  console.log("imputación de pagos OK");
}
