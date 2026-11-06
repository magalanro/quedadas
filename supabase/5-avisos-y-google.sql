create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre)
  values (
    new.id,
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''),
      nullif(split_part(trim(new.raw_user_meta_data ->> 'full_name'), ' ', 1), ''),
      nullif(split_part(trim(new.raw_user_meta_data ->> 'name'), ' ', 1), ''),
      split_part(new.email, '@', 1),
      'Sin nombre'
    ), 30)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

do $$
begin
  create extension if not exists pg_net;
exception
  when others then raise notice 'pg_net no disponible: %', sqlerrm;
end;
$$;

create table if not exists public.suscripciones_push (
  endpoint text primary key check (char_length(endpoint) between 10 and 1000),
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  creada timestamptz not null default now()
);

create index if not exists suscripciones_push_usuario_idx on public.suscripciones_push (usuario_id);

create table if not exists public.preferencias_avisos (
  usuario_id uuid primary key default auth.uid() references public.perfiles (id) on delete cascade,
  recordatorios boolean not null default true,
  chat boolean not null default true,
  plazas boolean not null default true,
  nuevas boolean not null default false,
  deportes text[] not null default '{}',
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  radio_km int not null default 5 check (radio_km between 1 and 50),
  actualizada timestamptz not null default now()
);

create table if not exists public.avisos_pendientes (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  titulo text not null,
  cuerpo text not null,
  url text not null default './',
  etiqueta text,
  creado timestamptz not null default now(),
  reclamado timestamptz
);

create index if not exists avisos_pendientes_sin_enviar_idx on public.avisos_pendientes (id) where reclamado is null;

create table if not exists public.claves_vapid (
  id int primary key default 1 check (id = 1),
  publica text not null,
  privada text not null,
  creada timestamptz not null default now()
);

create table if not exists public.avisos_enviados (
  clave text primary key,
  creado timestamptz not null default now()
);

alter table public.suscripciones_push enable row level security;
alter table public.preferencias_avisos enable row level security;
alter table public.avisos_pendientes enable row level security;
alter table public.avisos_enviados enable row level security;
alter table public.claves_vapid enable row level security;
revoke all on public.claves_vapid from anon, authenticated;
grant select, insert on public.claves_vapid to service_role;

drop policy if exists "ver mis suscripciones" on public.suscripciones_push;
create policy "ver mis suscripciones" on public.suscripciones_push for select to authenticated using (usuario_id = auth.uid());

drop policy if exists "ver mis preferencias" on public.preferencias_avisos;
create policy "ver mis preferencias" on public.preferencias_avisos for select to authenticated using (usuario_id = auth.uid());
drop policy if exists "crear mis preferencias" on public.preferencias_avisos;
create policy "crear mis preferencias" on public.preferencias_avisos for insert to authenticated with check (usuario_id = auth.uid());
drop policy if exists "cambiar mis preferencias" on public.preferencias_avisos;
create policy "cambiar mis preferencias" on public.preferencias_avisos for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

grant select on public.suscripciones_push to authenticated;
grant select, insert, update on public.preferencias_avisos to authenticated;
grant select, delete on public.suscripciones_push to service_role;
grant select on public.preferencias_avisos, public.perfiles, public.actividades, public.inscripciones to service_role;
grant select, update, delete on public.avisos_pendientes to service_role;

create or replace function public.guardar_suscripcion(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para activar los avisos.';
  end if;
  insert into public.suscripciones_push (endpoint, usuario_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth, creada = now();
end;
$$;

create or replace function public.borrar_suscripcion(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.suscripciones_push where endpoint = p_endpoint and usuario_id = auth.uid();
$$;

create or replace function public.avisar_funcion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://qndrvqkmdomviczavvwv.supabase.co/functions/v1/enviar-avisos',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
exception
  when others then null;
end;
$$;

create or replace function public.quiere_aviso(p_usuario uuid, p_tipo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.suscripciones_push s where s.usuario_id = p_usuario)
     and coalesce(
       (select case p_tipo
                 when 'chat' then p.chat
                 when 'plazas' then p.plazas
                 when 'recordatorios' then p.recordatorios
                 when 'nuevas' then p.nuevas
               end
        from public.preferencias_avisos p where p.usuario_id = p_usuario),
       p_tipo <> 'nuevas'
     );
$$;

create or replace function public.encolar_aviso(p_usuario uuid, p_tipo text, p_titulo text, p_cuerpo text, p_url text, p_etiqueta text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.quiere_aviso(p_usuario, p_tipo) then
    insert into public.avisos_pendientes (usuario_id, titulo, cuerpo, url, etiqueta)
    values (p_usuario, left(p_titulo, 80), left(p_cuerpo, 180), p_url, p_etiqueta);
  end if;
end;
$$;

create or replace function public.hora_quedada(p_inicio timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when (p_inicio at time zone 'Europe/Madrid')::date = (now() at time zone 'Europe/Madrid')::date
      then 'hoy a las ' || to_char(p_inicio at time zone 'Europe/Madrid', 'HH24:MI')
    when (p_inicio at time zone 'Europe/Madrid')::date = (now() at time zone 'Europe/Madrid')::date + 1
      then 'mañana a las ' || to_char(p_inicio at time zone 'Europe/Madrid', 'HH24:MI')
    else 'el ' || to_char(p_inicio at time zone 'Europe/Madrid', 'DD/MM') || ' a las ' || to_char(p_inicio at time zone 'Europe/Madrid', 'HH24:MI')
  end;
$$;

create or replace function public.nombre_deporte(p_clave text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_clave
    when 'futbol' then 'fútbol'
    when 'futbolsala' then 'fútbol sala'
    when 'running' then 'running'
    when 'ciclismo' then 'ciclismo'
    when 'senderismo' then 'senderismo'
    when 'patinaje' then 'patines'
    when 'baloncesto' then 'baloncesto'
    when 'padel' then 'pádel'
    when 'voley' then 'vóley'
    when 'yoga' then 'yoga'
    when 'calistenia' then 'calistenia'
    else p_clave
  end;
$$;

create or replace function public.avisar_mensaje_nuevo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text;
  v_organizador uuid;
  v_autor text;
  r record;
begin
  if new.tipo <> 'texto' then
    return null;
  end if;
  select a.titulo, a.organizador into v_titulo, v_organizador from public.actividades a where a.id = new.actividad_id;
  select p.nombre into v_autor from public.perfiles p where p.id = new.autor_id;
  for r in
    select i.usuario_id from public.inscripciones i where i.actividad_id = new.actividad_id
    union
    select v_organizador
  loop
    if r.usuario_id is distinct from new.autor_id then
      perform public.encolar_aviso(r.usuario_id, 'chat', v_titulo, coalesce(v_autor, 'Alguien') || ': ' || new.texto, '#a-' || new.actividad_id, 'chat-' || new.actividad_id);
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists al_escribir_mensaje on public.mensajes;
create trigger al_escribir_mensaje after insert on public.mensajes
  for each row execute function public.avisar_mensaje_nuevo();

create or replace function public.avisar_cambio_plaza()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text;
  v_inicio timestamptz;
begin
  if coalesce(current_setting('quedadas.sin_avisos', true), '') = 'si' then
    return null;
  end if;
  select a.titulo, a.inicio into v_titulo, v_inicio from public.actividades a where a.id = new.actividad_id;
  if old.estado = 'espera' and new.estado = 'dentro' then
    perform public.encolar_aviso(new.usuario_id, 'plazas', '¡Tienes plaza!', 'Has entrado en «' || v_titulo || '», ' || public.hora_quedada(v_inicio) || '.', '#a-' || new.actividad_id, 'plaza-' || new.actividad_id);
  elsif old.estado = 'dentro' and new.estado = 'espera' then
    perform public.encolar_aviso(new.usuario_id, 'plazas', 'Has pasado a la lista de espera', 'No confirmaste que ibas a «' || v_titulo || '» y tu plaza ha pasado a otra persona.', '#a-' || new.actividad_id, 'plaza-' || new.actividad_id);
  end if;
  return null;
end;
$$;

drop trigger if exists al_cambiar_plaza on public.inscripciones;
create trigger al_cambiar_plaza after update of estado on public.inscripciones
  for each row execute function public.avisar_cambio_plaza();

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

drop trigger if exists al_crear_quedada_avisar on public.actividades;
create trigger al_crear_quedada_avisar after insert on public.actividades
  for each row execute function public.avisar_quedada_nueva();

create or replace function public.despertar_envio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.avisar_funcion();
  return null;
end;
$$;

drop trigger if exists al_encolar_aviso on public.avisos_pendientes;
create trigger al_encolar_aviso after insert on public.avisos_pendientes
  for each statement execute function public.despertar_envio();

create or replace function public.programar_recordatorios()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_nuevos int := 0;
  v_clave text;
begin
  perform public.liberar_sin_confirmar();
  for r in
    select i.actividad_id, i.usuario_id, a.titulo, a.inicio, a.lugar_nombre
    from public.inscripciones i
    join public.actividades a on a.id = i.actividad_id
    where i.estado = 'dentro' and not i.confirmada and i.usuario_id <> a.organizador
      and a.inicio > now() + interval '65 minutes' and a.inicio <= now() + interval '3 hours'
  loop
    v_clave := 'confirmar:' || r.actividad_id || ':' || r.usuario_id;
    insert into public.avisos_enviados (clave) values (v_clave) on conflict do nothing;
    if found then
      perform public.encolar_aviso(r.usuario_id, 'recordatorios', '¿Sigues yendo?', '«' || r.titulo || '» es ' || public.hora_quedada(r.inicio) || '. Confírmalo para guardar tu plaza.', '#a-' || r.actividad_id, 'confirmar-' || r.actividad_id);
      v_nuevos := v_nuevos + 1;
    end if;
  end loop;
  for r in
    select i.actividad_id, i.usuario_id, a.titulo, a.inicio, a.lugar_nombre
    from public.inscripciones i
    join public.actividades a on a.id = i.actividad_id
    where i.estado = 'dentro'
      and a.inicio > now() and a.inicio <= now() + interval '65 minutes'
  loop
    v_clave := 'recordatorio:' || r.actividad_id || ':' || r.usuario_id;
    insert into public.avisos_enviados (clave) values (v_clave) on conflict do nothing;
    if found then
      perform public.encolar_aviso(r.usuario_id, 'recordatorios', 'Empieza en 1 hora', '«' || r.titulo || '» ' || public.hora_quedada(r.inicio) || ' en ' || r.lugar_nombre || '.', '#a-' || r.actividad_id, 'recordatorio-' || r.actividad_id);
      v_nuevos := v_nuevos + 1;
    end if;
  end loop;
  delete from public.avisos_pendientes where reclamado < now() - interval '7 days';
  delete from public.avisos_enviados where creado < now() - interval '30 days';
  return v_nuevos;
end;
$$;

create or replace function public.reclamar_avisos(p_limite int default 200)
returns setof public.avisos_pendientes
language sql
security definer
set search_path = ''
as $$
  update public.avisos_pendientes
  set reclamado = now()
  where id in (
    select id from public.avisos_pendientes
    where reclamado is null
    order by id
    limit p_limite
    for update skip locked
  )
  returning *;
$$;

revoke execute on function public.guardar_suscripcion(text, text, text) from public, anon;
revoke execute on function public.borrar_suscripcion(text) from public, anon;
grant execute on function public.guardar_suscripcion(text, text, text) to authenticated;
grant execute on function public.borrar_suscripcion(text) to authenticated;
revoke execute on function public.avisar_funcion() from public, anon, authenticated;
revoke execute on function public.quiere_aviso(uuid, text) from public, anon, authenticated;
revoke execute on function public.encolar_aviso(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.avisar_mensaje_nuevo() from public, anon, authenticated;
revoke execute on function public.avisar_cambio_plaza() from public, anon, authenticated;
revoke execute on function public.avisar_quedada_nueva() from public, anon, authenticated;
revoke execute on function public.despertar_envio() from public, anon, authenticated;
revoke execute on function public.programar_recordatorios() from public, anon, authenticated;
revoke execute on function public.reclamar_avisos(int) from public, anon, authenticated;
grant execute on function public.reclamar_avisos(int) to service_role;

do $$
begin
  create extension if not exists pg_cron;
  begin
    perform cron.unschedule('quedadas-liberar-plazas');
  exception
    when others then null;
  end;
  perform cron.schedule('quedadas-recordatorios', '* * * * *', 'select public.programar_recordatorios()');
exception
  when others then raise notice 'pg_cron no disponible: los recordatorios no se enviarán solos: %', sqlerrm;
end;
$$;
