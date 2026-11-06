grant usage on schema public to anon, authenticated;
grant select on public.perfiles, public.actividades, public.inscripciones, public.comentarios to anon, authenticated;
grant insert, update on public.perfiles to authenticated;
grant insert, update, delete on public.actividades to authenticated;
grant insert, delete on public.comentarios to authenticated;
