create extension if not exists pgcrypto;

create table if not exists public.perfiles (
  id uuid primary key,
  nombre text not null check (char_length(nombre) between 1 and 30),
  creado timestamptz not null default now()
);

create table if not exists public.actividades (
  id uuid primary key default gen_random_uuid(),
  deporte text not null check (deporte ~ '^[a-z]{2,20}$'),
  titulo text not null check (char_length(titulo) between 1 and 70),
  descripcion text not null default '' check (char_length(descripcion) <= 500),
  inicio timestamptz not null,
  duracion_min int not null check (duracion_min between 15 and 720),
  lugar_nombre text not null check (char_length(lugar_nombre) between 1 and 80),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  ruta jsonb check (ruta is null or (jsonb_typeof(ruta) = 'array' and jsonb_array_length(ruta) <= 500)),
  ritmo text not null default '' check (char_length(ritmo) <= 40),
  nivel text not null default 'todos' check (nivel in ('todos', 'principiante', 'intermedio', 'avanzado')),
  min int not null check (min between 1 and 100),
  max int not null check (max between 2 and 100),
  precio numeric(6, 2) not null default 0 check (precio between 0 and 500),
  organizador uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  ejemplo boolean not null default false,
  creada timestamptz not null default now(),
  check (min <= max)
);

create table if not exists public.inscripciones (
  actividad_id uuid not null references public.actividades (id) on delete cascade,
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  estado text not null check (estado in ('dentro', 'espera')),
  creada timestamptz not null default clock_timestamp(),
  primary key (actividad_id, usuario_id)
);

create table if not exists public.comentarios (
  id uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references public.actividades (id) on delete cascade,
  autor_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 400),
  creada timestamptz not null default now()
);

create index if not exists actividades_inicio_idx on public.actividades (inicio);
create index if not exists inscripciones_usuario_idx on public.inscripciones (usuario_id);
create index if not exists comentarios_actividad_idx on public.comentarios (actividad_id, creada);

grant usage on schema public to anon, authenticated;
grant select on public.perfiles, public.actividades, public.inscripciones, public.comentarios to anon, authenticated;
grant insert, update on public.perfiles to authenticated;
grant insert, update, delete on public.actividades to authenticated;
grant insert, delete on public.comentarios to authenticated;

alter table public.perfiles enable row level security;
alter table public.actividades enable row level security;
alter table public.inscripciones enable row level security;
alter table public.comentarios enable row level security;

drop policy if exists "perfiles visibles" on public.perfiles;
create policy "perfiles visibles" on public.perfiles for select using (true);
drop policy if exists "crear mi perfil" on public.perfiles;
create policy "crear mi perfil" on public.perfiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "editar mi perfil" on public.perfiles;
create policy "editar mi perfil" on public.perfiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "actividades visibles" on public.actividades;
create policy "actividades visibles" on public.actividades for select using (true);
drop policy if exists "crear actividad" on public.actividades;
create policy "crear actividad" on public.actividades for insert to authenticated
  with check (organizador = auth.uid() and ejemplo = false and inicio > now() - interval '5 minutes');
drop policy if exists "editar mi actividad" on public.actividades;
create policy "editar mi actividad" on public.actividades for update to authenticated
  using (organizador = auth.uid()) with check (organizador = auth.uid());
drop policy if exists "borrar mi actividad" on public.actividades;
create policy "borrar mi actividad" on public.actividades for delete to authenticated using (organizador = auth.uid());

drop policy if exists "inscripciones visibles" on public.inscripciones;
create policy "inscripciones visibles" on public.inscripciones for select using (true);

drop policy if exists "comentarios visibles" on public.comentarios;
create policy "comentarios visibles" on public.comentarios for select using (true);
drop policy if exists "comentar" on public.comentarios;
create policy "comentar" on public.comentarios for insert to authenticated with check (autor_id = auth.uid());
drop policy if exists "borrar mi comentario" on public.comentarios;
create policy "borrar mi comentario" on public.comentarios for delete to authenticated using (autor_id = auth.uid());

create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1), 'Sin nombre'), 30))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

create or replace function public.inscribir_organizador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inscripciones (actividad_id, usuario_id, estado)
  values (new.id, new.organizador, 'dentro')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists al_crear_actividad on public.actividades;
create trigger al_crear_actividad after insert on public.actividades
  for each row execute function public.inscribir_organizador();

create or replace function public.apuntarse(p_actividad uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int;
  v_fin timestamptz;
  v_dentro int;
  v_estado text;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para apuntarte.';
  end if;
  select a.max, a.inicio + make_interval(mins => a.duracion_min) into v_max, v_fin
  from public.actividades a where a.id = p_actividad for update;
  if not found then
    raise exception 'Esa quedada ya no existe.';
  end if;
  if v_fin < now() then
    raise exception 'Esa quedada ya ha terminado.';
  end if;
  select i.estado into v_estado from public.inscripciones i
  where i.actividad_id = p_actividad and i.usuario_id = auth.uid();
  if found then
    return v_estado;
  end if;
  select count(*) into v_dentro from public.inscripciones i
  where i.actividad_id = p_actividad and i.estado = 'dentro';
  v_estado := case when v_dentro < v_max then 'dentro' else 'espera' end;
  insert into public.inscripciones (actividad_id, usuario_id, estado) values (p_actividad, auth.uid(), v_estado);
  return v_estado;
end;
$$;

create or replace function public.salir(p_actividad uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organizador uuid;
  v_max int;
  v_dentro int;
  v_siguiente uuid;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión primero.';
  end if;
  select a.organizador, a.max into v_organizador, v_max
  from public.actividades a where a.id = p_actividad for update;
  if not found then
    raise exception 'Esa quedada ya no existe.';
  end if;
  if v_organizador = auth.uid() then
    raise exception 'Quien organiza no puede borrarse. Si no vas a poder ir, cancela la quedada.';
  end if;
  delete from public.inscripciones i where i.actividad_id = p_actividad and i.usuario_id = auth.uid();
  loop
    select count(*) into v_dentro from public.inscripciones i
    where i.actividad_id = p_actividad and i.estado = 'dentro';
    exit when v_dentro >= v_max;
    v_siguiente := null;
    select i.usuario_id into v_siguiente from public.inscripciones i
    where i.actividad_id = p_actividad and i.estado = 'espera'
    order by i.creada limit 1;
    exit when v_siguiente is null;
    update public.inscripciones set estado = 'dentro'
    where actividad_id = p_actividad and usuario_id = v_siguiente;
  end loop;
end;
$$;

revoke execute on function public.apuntarse(uuid) from public, anon;
revoke execute on function public.salir(uuid) from public, anon;
grant execute on function public.apuntarse(uuid) to authenticated;
grant execute on function public.salir(uuid) to authenticated;
revoke execute on function public.crear_perfil_nuevo_usuario() from public, anon, authenticated;
revoke execute on function public.inscribir_organizador() from public, anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.actividades, public.inscripciones, public.comentarios;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
