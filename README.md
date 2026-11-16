# Sistema de cuotas, conciliación y alertas preventivas de morosidad (MVP APF2 + APF3)

Aplicación web para que la junta de propietarios o la administración de un condominio:

1. Mantenga el **padrón de unidades** y sus cuotas.
2. **Suba el estado de cuenta del banco (CSV)** y **concilie automáticamente** cada abono con la unidad que pagó (por n° de operación reportado por el vecino, por código de unidad en la descripción o por nombre del propietario).
3. Vea la **morosidad** histórica por unidad y mes, con días de retraso.
4. **Alertas de morosidad con Machine Learning (US12, APF3)**: estima qué unidades caerán en mora en el mes (riesgo alto, medio o bajo) usando solo los pagos registrados antes del día 1. En meses pasados compara la predicción con lo que realmente pasó.
5. **Recordatorio cordial por WhatsApp (US13)** para las unidades con alerta, sin mencionar puntajes.
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

### 2. API del modelo (FastAPI en Python), opcional
```bash
pip install -r ml/requirements.txt
npm run api        # http://localhost:8000  (documentación en /docs)
```
Con la web en `localhost`, la pantalla *Alertas ML* llama a `POST /api/v1/predecir-lote`. Si la API no está encendida (o en la web publicada, salvo que se defina `NEXT_PUBLIC_ML_API_URL`), la pantalla calcula la misma fórmula en el navegador con `ml/model_params.json`. La prueba `npm run test` comprueba que ambas den la misma probabilidad.

### 3. Modelo (notebook)
Todo el trabajo de Machine Learning está en `ml/` (ver `ml/LEEME.md`). El notebook `ml/APF3_TD_Grupo5_ML_Innovacion.ipynb` genera el dataset, entrena, evalúa y exporta `modelo_morosidad.joblib` y `model_params.json`. Si se vuelve a entrenar, hay que volver a hacer `npm run build` para que la web use los nuevos parámetros.

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

## Limitaciones conocidas (pendiente PROY)

- El login es de demostración (clave y PIN guardados en la base). Pendiente: Supabase Auth y políticas RLS por rol.
- Las políticas de Supabase del MVP permiten acceso con la clave pública: no cargar datos personales reales sin antes activar Auth.
- OCR de capturas como respaldo.
- El modelo de morosidad se entrenó con datos simulados: hay que volver a entrenarlo con extractos reales.
- La API del modelo no está publicada: en la web pública el cálculo se hace en el navegador.

## Estructura

```
src/lib/conciliacion.ts   lectura del CSV y reglas de conciliación
src/lib/morosidad.ts      estado por unidad, morosidad, reporte mensual y dataset APF3
src/lib/store.ts          persistencia (Supabase / LocalStorage)
src/lib/seed.ts           datos de ejemplo
src/lib/ml.ts             variables y fórmula del modelo de morosidad (igual a ml/morosidad_ml.py)
src/app/admin/alertas     pantalla Alertas ML (US12, US13)
ml/                       notebook, dataset, modelo, API FastAPI (api_ml.py) y figuras del APF3
src/app/admin/*           pantallas del administrador
src/app/vecino            pantalla del vecino
src/app/reporte           reporte mensual (ambos roles)
supabase/schema.sql       tablas de la base de datos
tests/logica.test.ts      pruebas de la lógica
```
