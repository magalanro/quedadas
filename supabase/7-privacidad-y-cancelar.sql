alter table public.actividades add column if not exists n_dentro int not null default 0;
alter table public.actividades add column if not exists n_espera int not null default 0;
alter table public.grupos add column if not exists n_miembros int not null default 0;

create table if not exists public.grupos_saltos (
  grupo_id uuid not null references public.grupos (id) on delete cascade,
  inicio timestamptz not null,
  primary key (grupo_id, inicio)
);
alter table public.grupos_saltos enable row level security;
revoke all on public.grupos_saltos from public, anon, authenticated;
grant all on public.grupos_saltos to service_role;

create or replace function public.contar_inscripciones()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actividad uuid := coalesce(new.actividad_id, old.actividad_id);
begin
  perform set_config('quedadas.contando', 'si', true);
  update public.actividades a set
    n_dentro = (select count(*) from public.inscripciones i where i.actividad_id = v_actividad and i.estado = 'dentro'),
    n_espera = (select count(*) from public.inscripciones i where i.actividad_id = v_actividad and i.estado = 'espera')
  where a.id = v_actividad;
  perform set_config('quedadas.contando', '', true);
  return null;
end;
$$;

drop trigger if exists al_contar_inscripciones on public.inscripciones;
create trigger al_contar_inscripciones after insert or delete or update of estado on public.inscripciones
  for each row execute function public.contar_inscripciones();

create or replace function public.contar_miembros()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grupo uuid := coalesce(new.grupo_id, old.grupo_id);
begin
  perform set_config('quedadas.contando', 'si', true);
  update public.grupos g set n_miembros = (select count(*) from public.miembros_grupo m where m.grupo_id = v_grupo)
  where g.id = v_grupo;
  perform set_config('quedadas.contando', '', true);
  return null;
end;
$$;

drop trigger if exists al_contar_miembros on public.miembros_grupo;
create trigger al_contar_miembros after insert or delete on public.miembros_grupo
  for each row execute function public.contar_miembros();

create or replace function public.proteger_contadores_actividad()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.n_dentro := 0;
    new.n_espera := 0;
    if auth.uid() is not null and (
      select count(*) from public.actividades a
      where a.organizador = auth.uid() and a.creada > now() - interval '1 day'
    ) >= 10 then
      raise exception 'Hoy ya has creado 10 quedadas. Podrás crear más mañana.';
    end if;
  elsif coalesce(current_setting('quedadas.contando', true), '') <> 'si' then
    new.n_dentro := old.n_dentro;
    new.n_espera := old.n_espera;
  end if;
  return new;
end;
$$;

drop trigger if exists al_guardar_actividad on public.actividades;
create trigger al_guardar_actividad before insert or update on public.actividades
  for each row execute function public.proteger_contadores_actividad();

create or replace function public.proteger_contadores_grupo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.n_miembros := 0;
    if auth.uid() is not null and (
      select count(*) from public.grupos g
      where g.creador = auth.uid() and g.creado > now() - interval '1 day'
    ) >= 3 then
      raise exception 'Hoy ya has creado 3 grupos. Podrás crear más mañana.';
    end if;
  elsif coalesce(current_setting('quedadas.contando', true), '') <> 'si' then
    new.n_miembros := old.n_miembros;
  end if;
  return new;
end;
$$;

drop trigger if exists al_guardar_grupo on public.grupos;
create trigger al_guardar_grupo before insert or update on public.grupos
  for each row execute function public.proteger_contadores_grupo();

select set_config('quedadas.contando', 'si', true);

update public.actividades a set
  n_dentro = (select count(*) from public.inscripciones i where i.actividad_id = a.id and i.estado = 'dentro'),
  n_espera = (select count(*) from public.inscripciones i where i.actividad_id = a.id and i.estado = 'espera');

update public.grupos g set n_miembros = (select count(*) from public.miembros_grupo m where m.grupo_id = g.id);

select set_config('quedadas.contando', '', true);

create or replace function public.es_del_grupo(p_grupo uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.miembros_grupo m where m.grupo_id = p_grupo and m.usuario_id = auth.uid())
      or exists (select 1 from public.grupos g where g.id = p_grupo and g.creador = auth.uid());
$$;

create or replace function public.puede_ver_perfil(p_perfil uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_perfil = auth.uid()
      or exists (select 1 from public.actividades a where a.organizador = p_perfil)
      or exists (select 1 from public.grupos g where g.creador = p_perfil)
      or (auth.uid() is not null and (
           exists (select 1 from public.inscripciones i where i.usuario_id = p_perfil and public.puede_ver_chat(i.actividad_id))
        or exists (select 1 from public.mensajes m where m.autor_id = p_perfil and public.puede_ver_chat(m.actividad_id))
        or exists (
             select 1 from public.miembros_grupo m1
             join public.miembros_grupo m2 on m2.grupo_id = m1.grupo_id
             where m1.usuario_id = p_perfil and m2.usuario_id = auth.uid()
           )
      ));
$$;

revoke execute on function public.contar_inscripciones() from public, anon, authenticated;
revoke execute on function public.contar_miembros() from public, anon, authenticated;
revoke execute on function public.es_del_grupo(uuid) from public, anon;
revoke execute on function public.puede_ver_perfil(uuid) from public;
grant execute on function public.es_del_grupo(uuid) to authenticated;
grant execute on function public.puede_ver_perfil(uuid) to anon, authenticated;
grant execute on function public.puede_ver_chat(uuid) to anon, authenticated;

drop policy if exists "perfiles visibles" on public.perfiles;
create policy "perfiles visibles" on public.perfiles for select using (public.puede_ver_perfil(id));

drop policy if exists "inscripciones visibles" on public.inscripciones;
create policy "inscripciones visibles" on public.inscripciones for select using (
  exists (select 1 from public.actividades a where a.id = actividad_id and a.organizador = usuario_id)
  or (auth.uid() is not null and (usuario_id = auth.uid() or public.puede_ver_chat(actividad_id)))
);

drop policy if exists "miembros visibles" on public.miembros_grupo;
create policy "miembros visibles" on public.miembros_grupo for select to authenticated using (
  usuario_id = auth.uid() or public.es_del_grupo(grupo_id)
);

drop policy if exists "comentarios visibles" on public.comentarios;
drop policy if exists "comentar" on public.comentarios;
revoke select, insert on public.comentarios from anon, authenticated;

create or replace function public.avisar_cancelacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if old.grupo_id is not null and old.inicio > now() then
    insert into public.grupos_saltos (grupo_id, inicio) values (old.grupo_id, old.inicio) on conflict do nothing;
  end if;
  if old.ejemplo or old.inicio <= now() or coalesce(current_setting('quedadas.sin_avisos', true), '') = 'si' then
    return old;
  end if;
  for r in
    select i.usuario_id from public.inscripciones i
    where i.actividad_id = old.id and i.usuario_id <> old.organizador
  loop
    perform public.encolar_aviso(
      r.usuario_id,
      'recordatorios',
      'Se cancela: ' || old.titulo,
      'La quedada de ' || public.hora_quedada(old.inicio) || ' se ha cancelado.' || case when old.grupo_id is not null then ' El grupo sigue la semana que viene.' else '' end,
      '#',
      'cancelada-' || old.id
    );
  end loop;
  return old;
end;
$$;

revoke execute on function public.avisar_cancelacion() from public, anon, authenticated;

drop trigger if exists al_cancelar_quedada on public.actividades;
create trigger al_cancelar_quedada before delete on public.actividades
  for each row execute function public.avisar_cancelacion();

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
  v_vueltas int := 0;
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
  delete from public.grupos_saltos s where s.grupo_id = p_grupo and s.inicio < now();
  v_inicio := public.proxima_fecha_grupo(g.dia_semana, g.hora, g.desde);
  if v_inicio is null then
    return null;
  end if;
  while exists (select 1 from public.grupos_saltos s where s.grupo_id = p_grupo and s.inicio = v_inicio) and v_vueltas < 10 loop
    v_inicio := ((v_inicio at time zone 'Europe/Madrid') + interval '7 days') at time zone 'Europe/Madrid';
    v_vueltas := v_vueltas + 1;
  end loop;
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

revoke execute on function public.crear_quedada_de_grupo(uuid) from public, anon, authenticated;
