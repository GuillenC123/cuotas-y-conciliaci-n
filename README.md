# Sistema de cuotas, conciliación y alertas preventivas de morosidad (MVP APF2 + APF3)

Aplicación web para que la junta de propietarios o la administración de un condominio:

1. Mantenga el **padrón de unidades** y sus cuotas.
2. **Suba el estado de cuenta del banco (CSV)** y **concilie automáticamente** cada abono con la unidad que pagó (por n° de operación reportado por el vecino, por código de unidad en la descripción o por nombre del propietario).
3. Vea la **morosidad** histórica por unidad y mes, con días de retraso.
4. **Alertas Preventivas de Morosidad con Machine Learning (US12 / APF3)**: clasifica a cada departamento en el semáforo preventivo (Alto, Medio, Bajo) 3 días antes del vencimiento.
5. **Recordatorio preventivo cordial por WhatsApp en 1 clic (US13)**.
6. Publique un **reporte mensual de ingresos y egresos** visible para todos los vecinos.
7. Exporte el **dataset para el modelo de ML del APF3**.

## Correr en local

### 1. Iniciar el Frontend (Next.js)
```bash
npm install
npm run dev        # http://localhost:3000
npm run test       # pruebas unitarias de conciliación y del modelo ML
npm run build      # genera la carpeta out/ para publicar
```

### 2. Iniciar el Microservicio Backend de ML (FastAPI en Python) - Opcional
```bash
npm run api        # http://localhost:8000
# Documentación Swagger interactiva: http://localhost:8000/docs
```
> **Nota de Resiliencia:** Si el microservicio de Python no está iniciado o está apagado, la web utiliza automáticamente su motor matemático integrado (fallback), por lo que las predicciones y el semáforo siempre funcionan sin interrupciones.

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
