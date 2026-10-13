# Sistema de cuotas y conciliación de pagos (MVP – APF2)

Aplicación web para que la junta de propietarios o la administración de un condominio:

1. Mantenga el **padrón de unidades** y sus cuotas.
2. **Suba el estado de cuenta del banco (CSV)** y **concilie automáticamente** cada abono con la unidad que pagó (por n° de operación reportado por el vecino, por código de unidad en la descripción o por nombre del propietario).
3. Vea la **morosidad** por unidad y mes, con días de retraso. Cada pago se aplica primero al mes más antiguo pendiente; lo que sobra queda como saldo a favor.
4. Publique un **reporte mensual de ingresos y egresos** visible para todos los vecinos.
5. Exporte el **dataset para el modelo de ML del APF3**.

El vecino entra con su código de unidad y PIN, y **solo ve su propio estado de cuenta** (Ley N.º 29733). También puede reportar su pago con el n° de operación.

> La prueba de pago es el **estado de cuenta bancario**, no capturas de Yape. El OCR de capturas queda como respaldo pendiente para el APF3.

## Credenciales de prueba (modo demo)

- Administrador: clave `admin123`
- Vecino: se muestran en la pantalla de ingreso (por ejemplo, unidad `A-101` y su PIN)

Los datos de ejemplo son **ficticios** (48 unidades, 6 meses de pagos). Se reemplazan en *Configuración → Empezar con datos reales*, luego se importa el padrón real (CSV con columnas `codigo,propietario,telefono,cuota`).

## Formato del estado de cuenta

CSV con las columnas: `Fecha, Descripcion, Monto, Nro Operacion`. Acepta fechas `dd/mm/aaaa` o `aaaa-mm-dd` y montos como `280.00` o `S/ 280,00`. Los cargos (montos negativos) se ignoran. En la pantalla *Conciliar pagos* hay un archivo de ejemplo para descargar.

## Tecnología

- Next.js 14 + React + TypeScript + Tailwind (exportado como sitio estático)
- Persistencia: **Supabase (PostgreSQL)** si se configuran las variables de entorno; si no, **LocalStorage** del navegador
- Librería `papaparse` para leer el CSV

## Correr en local

```bash
npm install
npm run dev        # http://localhost:3000
npm run test       # pruebas de la lógica de conciliación
npm run build      # genera la carpeta out/ (sitio listo para publicar)
```

## Publicar con URL pública

### Opción rápida (sin base de datos en la nube)
1. `npm run build` (o usar la carpeta `out/` ya generada).
2. Entrar a https://app.netlify.com/drop e iniciar sesión.
3. Arrastrar la carpeta `out` → Netlify da un link público.

En este modo cada navegador guarda sus propios datos (LocalStorage).

### Opción con base de datos real (recomendada para la sustentación)
1. Crear un proyecto gratis en https://supabase.com.
2. En *SQL Editor*, pegar y ejecutar `supabase/schema.sql`.
3. En *Project Settings → API*, copiar **Project URL** y **anon public key**.
4. Crear un archivo `.env.local` en la raíz:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
5. `npm run build` y publicar la carpeta `out/` como en la opción rápida (o importar el repositorio en Vercel con esas dos variables de entorno).

Al abrir la app por primera vez con Supabase vacío, se cargan los datos de ejemplo automáticamente.

## Limitaciones conocidas (pendiente APF3)

- El login es de demostración (clave y PIN guardados en la base). Pendiente: Supabase Auth y políticas RLS por rol.
- Las políticas de Supabase del MVP permiten acceso con la clave pública: no cargar datos personales reales sin antes activar Auth.
- OCR de capturas como respaldo, notificaciones por WhatsApp y modelo de predicción de morosidad.

## Estructura

```
src/lib/conciliacion.ts   lectura del CSV y reglas de conciliación
src/lib/morosidad.ts      estado por unidad, morosidad, reporte mensual y dataset APF3
src/lib/store.ts          persistencia (Supabase / LocalStorage)
src/lib/seed.ts           datos de ejemplo
src/app/admin/*           pantallas del administrador
src/app/vecino            pantalla del vecino
src/app/reporte           reporte mensual (ambos roles)
supabase/schema.sql       tablas de la base de datos
tests/logica.test.ts      pruebas de la lógica
```
