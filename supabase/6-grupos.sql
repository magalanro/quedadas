create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 1 and 60),
  deporte text not null check (deporte ~ '^[a-z]{2,20}$'),
  descripcion text not null default '' check (char_length(descripcion) <= 500),
  dia_semana int not null check (dia_semana between 1 and 7),
  hora time not null,
  desde date not null default ((now() at time zone 'Europe/Madrid')::date),
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
  creador uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  activo boolean not null default true,
  creado timestamptz not null default now(),
  check (min <= max)
);

create table if not exists public.miembros_grupo (
  grupo_id uuid not null references public.grupos (id) on delete cascade,
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  creado timestamptz not null default clock_timestamp(),
  primary key (grupo_id, usuario_id)
);

create index if not exists miembros_grupo_usuario_idx on public.miembros_grupo (usuario_id);

alter table public.actividades add column if not exists grupo_id uuid references public.grupos (id) on delete set null;
create unique index if not exists actividades_grupo_inicio_unico on public.actividades (grupo_id, inicio) where grupo_id is not null;

alter table public.grupos enable row level security;
alter table public.miembros_grupo enable row level security;

drop policy if exists "grupos visibles" on public.grupos;
create policy "grupos visibles" on public.grupos for select using (true);
drop policy if exists "crear grupo" on public.grupos;
create policy "crear grupo" on public.grupos for insert to authenticated with check (creador = auth.uid() and activo);
drop policy if exists "editar mi grupo" on public.grupos;
create policy "editar mi grupo" on public.grupos for update to authenticated using (creador = auth.uid()) with check (creador = auth.uid());
drop policy if exists "borrar mi grupo" on public.grupos;
create policy "borrar mi grupo" on public.grupos for delete to authenticated using (creador = auth.uid());

drop policy if exists "miembros visibles" on public.miembros_grupo;
create policy "miembros visibles" on public.miembros_grupo for select using (true);

grant select on public.grupos, public.miembros_grupo to anon, authenticated, service_role;
grant insert, update, delete on public.grupos to authenticated;

drop policy if exists "crear actividad" on public.actividades;
create policy "crear actividad" on public.actividades for insert to authenticated
  with check (organizador = auth.uid() and ejemplo = false and grupo_id is null and inicio > now() - interval '5 minutes');

create or replace function public.proteger_grupo_de_actividad()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.grupo_id is distinct from old.grupo_id and current_user in ('anon', 'authenticated') then
    raise exception 'No se puede cambiar el grupo de una quedada.';
  end if;
  return new;
end;
$$;

drop trigger if exists al_editar_actividad_grupo on public.actividades;
create trigger al_editar_actividad_grupo before update of grupo_id on public.actividades
  for each row execute function public.proteger_grupo_de_actividad();

create or replace function public.proxima_fecha_grupo(p_dia int, p_hora time, p_desde date)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select min((d::date + p_hora) at time zone 'Europe/Madrid')
  from generate_series(
    greatest(p_desde, (now() at time zone 'Europe/Madrid')::date)::timestamp,
    greatest(p_desde, (now() at time zone 'Europe/Madrid')::date)::timestamp + interval '8 days',
    interval '1 day'
  ) as d
  where extract(isodow from d) = p_dia
    and ((d::date + p_hora) at time zone 'Europe/Madrid') > now();
$$;

create or replace function public.crear_quedada_de_grupo(p_grupo uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  g record;
  v_id uuid;
  v_inicio timestamptz;
  v_dentro int;
  v_apuntados int := 0;
  r record;
begin
  select * into g from public.grupos where id = p_grupo and activo;
  if not found then
    return null;
  end if;
  select a.id into v_id from public.actividades a where a.grupo_id = p_grupo and a.inicio > now() order by a.inicio limit 1;
  if found then
    return v_id;
  end if;
  v_inicio := public.proxima_fecha_grupo(g.dia_semana, g.hora, g.desde);
  if v_inicio is null then
    return null;
  end if;
  insert into public.actividades (deporte, titulo, descripcion, inicio, duracion_min, lugar_nombre, lat, lng, ruta, ritmo, nivel, min, max, precio, organizador, grupo_id)
  values (g.deporte, g.nombre, g.descripcion, v_inicio, g.duracion_min, g.lugar_nombre, g.lat, g.lng, g.ruta, g.ritmo, g.nivel, g.min, g.max, g.precio, g.creador, g.id)
  on conflict (grupo_id, inicio) where grupo_id is not null do nothing
  returning id into v_id;
  if v_id is null then
    return null;
  end if;
  perform set_config('quedadas.sin_avisos', 'si', true);
  for r in
    select m.usuario_id from public.miembros_grupo m
    where m.grupo_id = g.id and m.usuario_id <> g.creador
    order by m.creado
  loop
    select count(*) into v_dentro from public.inscripciones i where i.actividad_id = v_id and i.estado = 'dentro';
    insert into public.inscripciones (actividad_id, usuario_id, estado, confirmada)
    values (v_id, r.usuario_id, case when v_dentro < g.max then 'dentro' else 'espera' end, v_inicio - now() < interval '3 hours')
    on conflict do nothing;
    v_apuntados := v_apuntados + 1;
    perform public.encolar_aviso(r.usuario_id, 'recordatorios', g.nombre, 'Ya está creada la quedada para ' || public.hora_quedada(v_inicio) || '. Te hemos apuntado: si no puedes ir, dilo en la app.', '#a-' || v_id, 'grupo-' || v_id);
  end loop;
  perform set_config('quedadas.sin_avisos', '', true);
  perform public.mensaje_sistema(v_id, 'Quedada semanal del grupo «' || g.nombre || '»' || case when v_apuntados > 0 then ': se ha apuntado a los ' || (v_apuntados + 1) || ' miembros' else '' end);
  return v_id;
end;
$$;

create or replace function public.crear_quedadas_de_grupos()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_creadas int := 0;
  v_antes int;
begin
  for r in select g.id from public.grupos g where g.activo loop
    select count(*) into v_antes from public.actividades where grupo_id = r.id;
    perform public.crear_quedada_de_grupo(r.id);
    if (select count(*) from public.actividades where grupo_id = r.id) > v_antes then
      v_creadas := v_creadas + 1;
    end if;
  end loop;
  return v_creadas;
end;
$$;

create or replace function public.al_crear_grupo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.miembros_grupo (grupo_id, usuario_id) values (new.id, new.creador) on conflict do nothing;
  perform public.crear_quedada_de_grupo(new.id);
  return null;
end;
$$;

drop trigger if exists al_insertar_grupo on public.grupos;
create trigger al_insertar_grupo after insert on public.grupos
  for each row execute function public.al_crear_grupo();

create or replace function public.al_reactivar_grupo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.activo and not old.activo then
    perform public.crear_quedada_de_grupo(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists al_cambiar_grupo on public.grupos;
create trigger al_cambiar_grupo after update of activo on public.grupos
  for each row execute function public.al_reactivar_grupo();

create or replace function public.unirse_grupo(p_grupo uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para unirte al grupo.';
  end if;
  if not exists (select 1 from public.grupos where id = p_grupo) then
    raise exception 'Ese grupo ya no existe.';
  end if;
  insert into public.miembros_grupo (grupo_id, usuario_id) values (p_grupo, auth.uid()) on conflict do nothing;
  select a.id into v_id from public.actividades a where a.grupo_id = p_grupo and a.inicio > now() order by a.inicio limit 1;
  if v_id is not null then
    perform public.apuntarse(v_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.salir_grupo(p_grupo uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión primero.';
  end if;
  if exists (select 1 from public.grupos where id = p_grupo and creador = auth.uid()) then
    raise exception 'Quien creó el grupo no puede salir. Si no quieres seguir, pausa el grupo.';
  end if;
  delete from public.miembros_grupo where grupo_id = p_grupo and usuario_id = auth.uid();
end;
$$;

create or replace function public.avisar_quedada_nueva()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if new.ejemplo then
    return null;
  end if;
  for r in
    select p.usuario_id
    from public.preferencias_avisos p
    where p.nuevas
      and p.usuario_id <> new.organizador
      and (new.grupo_id is null or not exists (select 1 from public.miembros_grupo m where m.grupo_id = new.grupo_id and m.usuario_id = p.usuario_id))
      and (cardinality(p.deportes) = 0 or new.deporte = any (p.deportes))
      and p.lat is not null and p.lng is not null
      and 2 * 6371 * asin(sqrt(
            power(sin(radians(new.lat - p.lat) / 2), 2)
            + cos(radians(p.lat)) * cos(radians(new.lat)) * power(sin(radians(new.lng - p.lng) / 2), 2)
          )) <= p.radio_km
  loop
    perform public.encolar_aviso(r.usuario_id, 'nuevas', 'Nueva quedada de ' || public.nombre_deporte(new.deporte) || ' cerca', new.titulo || ', ' || public.hora_quedada(new.inicio) || '.', '#a-' || new.id, 'nueva-' || new.id);
  end loop;
  return null;
end;
$$;

revoke execute on function public.crear_quedada_de_grupo(uuid) from public, anon, authenticated;
revoke execute on function public.crear_quedadas_de_grupos() from public, anon, authenticated;
revoke execute on function public.al_crear_grupo() from public, anon, authenticated;
revoke execute on function public.al_reactivar_grupo() from public, anon, authenticated;
revoke execute on function public.unirse_grupo(uuid) from public, anon;
revoke execute on function public.salir_grupo(uuid) from public, anon;
grant execute on function public.unirse_grupo(uuid) to authenticated;
grant execute on function public.salir_grupo(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.grupos, public.miembros_grupo;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
begin
  perform cron.schedule('quedadas-grupos', '*/10 * * * *', 'select public.crear_quedadas_de_grupos()');
exception
  when others then raise notice 'pg_cron no disponible: las quedadas de los grupos no se crearán solas: %', sqlerrm;
end;
$$;
