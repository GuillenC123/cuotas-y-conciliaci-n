-- Esquema de base de datos (Supabase / PostgreSQL)
-- Ejecutar completo en: Supabase > SQL Editor > New query > Run

create table if not exists config (
  id text primary key,
  nombre text not null,
  ruc text not null default '',
  distrito text not null default '',
  cuota numeric(10,2) not null,
  dia_vencimiento int not null default 10 check (dia_vencimiento between 1 and 28),
  clave_admin text not null,
  modo_demo boolean not null default true
);

create table if not exists unidades (
  id text primary key,
  codigo text not null unique,
  propietario text not null,
  telefono text not null default '',
  cuota numeric(10,2) not null check (cuota > 0),
  pin text not null,
  activa boolean not null default true
);

create table if not exists lotes (
  id text primary key,
  archivo text not null,
  fecha timestamptz not null default now(),
  filas int not null,
  automaticos int not null,
  revisar int not null,
  duplicados int not null,
  ignorados int not null,
  ms int not null
);

create table if not exists movimientos (
  id text primary key,
  fecha date not null,
  descripcion text not null default '',
  monto numeric(10,2) not null,
  operacion text not null,
  periodo text not null,               -- YYYY-MM
  unidad_id text references unidades(id) on delete set null,
  estado text not null check (estado in ('conciliado','parcial','excedente','duplicado','revisar')),
  regla text check (regla in ('reporte','codigo','nombre','manual')),
  lote_id text not null,
  creado_en timestamptz not null default now()
);
create index if not exists movimientos_unidad_periodo on movimientos (unidad_id, periodo);
create index if not exists movimientos_operacion on movimientos (operacion);

create table if not exists reportes (
  id text primary key,
  unidad_id text not null references unidades(id) on delete cascade,
  fecha date not null,
  monto numeric(10,2) not null check (monto > 0),
  operacion text not null,
  estado text not null check (estado in ('pendiente','verificado')),
  creado_en timestamptz not null default now()
);

create table if not exists egresos (
  id text primary key,
  fecha date not null,
  concepto text not null,
  categoria text not null,
  monto numeric(10,2) not null check (monto > 0)
);

-- Seguridad a nivel de fila (RLS).
-- MVP: políticas abiertas para la clave pública (anon) porque el login es de demostración.
-- Pendiente APF3: Supabase Auth + políticas por rol (cada vecino solo lee sus filas).
do $$
declare t text;
begin
  foreach t in array array['config','unidades','lotes','movimientos','reportes','egresos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists mvp_acceso on %I', t);
    execute format('create policy mvp_acceso on %I for all to anon using (true) with check (true)', t);
  end loop;
end $$;
