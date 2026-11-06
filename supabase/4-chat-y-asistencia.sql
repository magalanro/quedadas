alter table public.actividades add column if not exists aviso text not null default '' check (char_length(aviso) <= 200);
alter table public.inscripciones add column if not exists confirmada boolean not null default false;

create table if not exists public.mensajes (
  id uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references public.actividades (id) on delete cascade,
  autor_id uuid default auth.uid() references public.perfiles (id) on delete set null,
  tipo text not null default 'texto' check (tipo in ('texto', 'sistema')),
  texto text not null check (char_length(texto) between 1 and 500),
  creada timestamptz not null default clock_timestamp()
);

create index if not exists mensajes_actividad_idx on public.mensajes (actividad_id, creada);

create or replace function public.puede_ver_chat(p_actividad uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.inscripciones i where i.actividad_id = p_actividad and i.usuario_id = auth.uid())
      or exists (select 1 from public.actividades a where a.id = p_actividad and a.organizador = auth.uid());
$$;

alter table public.mensajes enable row level security;

drop policy if exists "leer chat si estoy apuntado" on public.mensajes;
create policy "leer chat si estoy apuntado" on public.mensajes for select to authenticated
  using (public.puede_ver_chat(actividad_id));
drop policy if exists "escribir en chat si estoy apuntado" on public.mensajes;
create policy "escribir en chat si estoy apuntado" on public.mensajes for insert to authenticated
  with check (tipo = 'texto' and autor_id = auth.uid() and public.puede_ver_chat(actividad_id));
drop policy if exists "borrar mi mensaje" on public.mensajes;
create policy "borrar mi mensaje" on public.mensajes for delete to authenticated
  using (tipo = 'texto' and autor_id = auth.uid());

grant select, insert, delete on public.mensajes to authenticated;
grant select on public.mensajes to anon;
revoke execute on function public.puede_ver_chat(uuid) from public, anon;
grant execute on function public.puede_ver_chat(uuid) to authenticated;

insert into public.mensajes (actividad_id, autor_id, tipo, texto, creada)
select c.actividad_id, c.autor_id, 'texto', c.texto, c.creada
from public.comentarios c
where not exists (
  select 1 from public.mensajes m
  where m.actividad_id = c.actividad_id and m.creada = c.creada and m.texto = c.texto
);

create or replace function public.mensaje_sistema(p_actividad uuid, p_texto text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.mensajes (actividad_id, autor_id, tipo, texto) values (p_actividad, null, 'sistema', p_texto);
$$;

create or replace function public.avisar_cambio_inscripcion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actividad uuid;
  v_usuario uuid;
  v_min int;
  v_organizador uuid;
  v_nombre text;
  v_dentro int;
  v_entra boolean := false;
begin
  if current_setting('quedadas.sin_avisos', true) = 'si' then
    return null;
  end if;
  if tg_op = 'DELETE' then
    v_actividad := old.actividad_id;
    v_usuario := old.usuario_id;
  else
    v_actividad := new.actividad_id;
    v_usuario := new.usuario_id;
  end if;
  select a.min, a.organizador into v_min, v_organizador from public.actividades a where a.id = v_actividad;
  if not found or v_usuario = v_organizador then
    return null;
  end if;
  select p.nombre into v_nombre from public.perfiles p where p.id = v_usuario;
  v_nombre := coalesce(v_nombre, 'Alguien');
  if tg_op = 'INSERT' then
    if new.estado = 'dentro' then
      perform public.mensaje_sistema(v_actividad, v_nombre || ' se ha apuntado');
      v_entra := true;
    else
      perform public.mensaje_sistema(v_actividad, v_nombre || ' está en la lista de espera');
    end if;
  elsif tg_op = 'DELETE' then
    perform public.mensaje_sistema(v_actividad, v_nombre || case when old.estado = 'espera' then ' ha salido de la lista de espera' else ' ya no puede ir' end);
  elsif old.estado = 'espera' and new.estado = 'dentro' then
    perform public.mensaje_sistema(v_actividad, v_nombre || ' entra desde la lista de espera');
    v_entra := true;
  elsif old.estado = 'dentro' and new.estado = 'espera' then
    perform public.mensaje_sistema(v_actividad, v_nombre || ' pasa a la lista de espera por no confirmar');
  end if;
  if v_entra and v_min > 1 then
    select count(*) into v_dentro from public.inscripciones i where i.actividad_id = v_actividad and i.estado = 'dentro';
    if v_dentro = v_min then
      perform public.mensaje_sistema(v_actividad, 'Ya sois ' || v_min || ': ¡quedada confirmada!');
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists al_cambiar_inscripcion on public.inscripciones;
create trigger al_cambiar_inscripcion after insert or update of estado or delete on public.inscripciones
  for each row execute function public.avisar_cambio_inscripcion();

create or replace function public.avisar_aviso_fijado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.aviso is distinct from old.aviso and new.aviso <> '' and coalesce(current_setting('quedadas.sin_avisos', true), '') <> 'si' then
    perform public.mensaje_sistema(new.id, 'Aviso fijado: ' || new.aviso);
  end if;
  return null;
end;
$$;

drop trigger if exists al_fijar_aviso on public.actividades;
create trigger al_fijar_aviso after update of aviso on public.actividades
  for each row execute function public.avisar_aviso_fijado();

create or replace function public.inscribir_organizador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inscripciones (actividad_id, usuario_id, estado, confirmada)
  values (new.id, new.organizador, 'dentro', true)
  on conflict do nothing;
  return new;
end;
$$;

create or replace function public.apuntarse(p_actividad uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_dentro int;
  v_estado text;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para apuntarte.';
  end if;
  select a.max, a.inicio, a.inicio + make_interval(mins => a.duracion_min) into v_max, v_inicio, v_fin
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
  insert into public.inscripciones (actividad_id, usuario_id, estado, confirmada)
  values (p_actividad, auth.uid(), v_estado, v_inicio - now() < interval '3 hours');
  return v_estado;
end;
$$;

create or replace function public.confirmar(p_actividad uuid, p_va boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión primero.';
  end if;
  if p_va then
    update public.inscripciones set confirmada = true
    where actividad_id = p_actividad and usuario_id = auth.uid();
    if not found then
      raise exception 'No estás apuntado a esta quedada.';
    end if;
  else
    perform public.salir(p_actividad);
  end if;
end;
$$;

create or replace function public.liberar_sin_confirmar()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_siguiente uuid;
  v_movidos int := 0;
begin
  for r in
    select i.actividad_id, i.usuario_id
    from public.inscripciones i
    join public.actividades a on a.id = i.actividad_id
    where i.estado = 'dentro'
      and not i.confirmada
      and i.usuario_id <> a.organizador
      and a.inicio > now()
      and a.inicio <= now() + interval '1 hour'
      and exists (select 1 from public.inscripciones e where e.actividad_id = a.id and e.estado = 'espera')
    order by i.creada desc
  loop
    v_siguiente := null;
    select e.usuario_id into v_siguiente
    from public.inscripciones e
    where e.actividad_id = r.actividad_id and e.estado = 'espera' and e.creada < now()
    order by e.creada
    limit 1;
    continue when v_siguiente is null;
    update public.inscripciones set estado = 'espera', creada = clock_timestamp()
    where actividad_id = r.actividad_id and usuario_id = r.usuario_id;
    update public.inscripciones set estado = 'dentro', confirmada = true
    where actividad_id = r.actividad_id and usuario_id = v_siguiente;
    v_movidos := v_movidos + 1;
  end loop;
  return v_movidos;
end;
$$;

revoke execute on function public.mensaje_sistema(uuid, text) from public, anon, authenticated;
revoke execute on function public.avisar_cambio_inscripcion() from public, anon, authenticated;
revoke execute on function public.avisar_aviso_fijado() from public, anon, authenticated;
revoke execute on function public.confirmar(uuid, boolean) from public, anon;
grant execute on function public.confirmar(uuid, boolean) to authenticated;
revoke execute on function public.liberar_sin_confirmar() from public, anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.mensajes;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('quedadas-liberar-plazas', '*/5 * * * *', 'select public.liberar_sin_confirmar()');
exception
  when others then raise notice 'pg_cron no disponible, la app liberará las plazas al abrirse: %', sqlerrm;
end;
$$;
