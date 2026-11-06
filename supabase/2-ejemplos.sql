create or replace function pg_temp.hora_ejemplo(p_horas int, p_dias int, p_hora text)
returns timestamptz
language plpgsql
as $$
declare
  v_local timestamp := now() at time zone 'Europe/Madrid';
  v_resultado timestamp;
begin
  if p_horas is not null then
    v_resultado := date_trunc('hour', v_local) + make_interval(hours => p_horas);
    if extract(hour from v_resultado) < 8 then
      v_resultado := date_trunc('day', v_resultado) + make_interval(hours => 8 + p_horas);
    end if;
  else
    v_resultado := date_trunc('day', v_local) + make_interval(days => p_dias) + p_hora::time;
  end if;
  return v_resultado at time zone 'Europe/Madrid';
end;
$$;

delete from public.actividades where ejemplo;

insert into public.perfiles (id, nombre) values
  ('09186059-7d09-593b-a6d5-42976e754fae', 'Javi'),
  ('1f833830-c4f9-52f2-ba9b-55b2f729d17b', 'Marta'),
  ('12643eb9-437e-5807-aef7-da488c84d2cb', 'Dani'),
  ('cddda50c-8ea7-5470-a3b9-bcae5838f173', 'Sara'),
  ('1b10e0ef-30a8-5b4e-91d1-ededdbcc899f', 'Pablo'),
  ('32edf06a-2d3c-5f30-85e2-519641214275', 'Irene'),
  ('dcf0e635-2506-5900-8acc-799f32586f2b', 'Álvaro'),
  ('d05f544e-7a4c-540b-b5b0-2b4af9657760', 'Nerea'),
  ('1b950305-367d-5560-a839-fcbe7bf7af8d', 'Hugo'),
  ('6c261515-862f-5652-86ca-b14664ff00ea', 'Carmen'),
  ('efaecdde-3dbc-5e8f-8d3d-b73cbb204de8', 'Rubén'),
  ('4613831d-d0b5-51d4-9078-055d54f4d137', 'Elena'),
  ('0a096929-4d63-5b26-b6f0-0320490a6b00', 'Sergio'),
  ('a5122727-2182-553c-9c4e-2d5801c3f0fd', 'Paula'),
  ('e17aeebc-b4d7-5f5a-89d2-bc77327d21a7', 'Adrián'),
  ('d06fd49d-ad53-5242-b75d-b5b861a032c4', 'Laura'),
  ('77b25638-3959-506d-802d-22afa3b3e271', 'Iker'),
  ('aef3281b-175f-579a-9f5d-8a55fb9f66ec', 'Noa'),
  ('ef193ad1-c05a-52a7-8746-8658ceaa43b5', 'Mario'),
  ('6339d9bf-1e8b-5c17-8d5a-c6a5c169a2e9', 'Alba'),
  ('adbd0c36-fb7e-5003-8cf7-9eed276b9367', 'Diego')
on conflict (id) do update set nombre = excluded.nombre;

insert into public.actividades (id, deporte, titulo, descripcion, inicio, duracion_min, lugar_nombre, lat, lng, ruta, ritmo, nivel, min, max, precio, organizador, ejemplo) values
  ('02479073-3844-5c94-8b84-fff3774dea23', 'futbol', 'Fútbol 7 en el Canal', 'Partido de fútbol 7 en césped artificial. Traed una camiseta blanca y otra oscura. El campo está reservado y se paga a medias.', pg_temp.hora_ejemplo(3, null, null), 90, 'Campo de fútbol del Canal de Isabel II', 40.4404, -3.7083, null, '', 'intermedio', 12, 14, 4, '09186059-7d09-593b-a6d5-42976e754fae', true),
  ('7b5d9469-72ba-53d3-87f5-91d5bd13e24b', 'running', 'Vuelta al Retiro a ritmo suave', 'Dos vueltas al perímetro del Retiro a ritmo de poder charlar. Nadie se queda atrás: esperamos en cada esquina.', pg_temp.hora_ejemplo(2, null, null), 60, 'Puerta de Alcalá, entrada al Retiro', 40.4199, -3.688, '[[40.4199, -3.688], [40.4203, -3.683], [40.4185, -3.679], [40.415, -3.6775], [40.4105, -3.679], [40.408, -3.683], [40.4095, -3.6875], [40.414, -3.689], [40.4199, -3.688]]'::jsonb, '6:30 min/km', 'principiante', 2, 15, 0, 'cddda50c-8ea7-5470-a3b9-bcae5838f173', true),
  ('acef642d-f93b-555a-a46c-7c96d637fbce', 'padel', 'Pádel: nos falta uno', 'Somos tres de nivel medio. Pista cubierta reservada durante hora y media.', pg_temp.hora_ejemplo(4, null, null), 90, 'Club de pádel Chamartín', 40.461, -3.677, null, '', 'intermedio', 4, 4, 6, 'dcf0e635-2506-5900-8acc-799f32586f2b', true),
  ('046c9a8a-1774-5e18-904d-a30299440da3', 'baloncesto', '3x3 en el Parque del Oeste', 'Pachanga de baloncesto. Los equipos se hacen al llegar y vamos rotando.', pg_temp.hora_ejemplo(null, 1, '18:30'), 90, 'Canchas del Parque del Oeste', 40.429, -3.721, null, '', 'todos', 6, 12, 0, '6c261515-862f-5652-86ca-b14664ff00ea', true),
  ('184b1525-6786-5b77-8686-da34701e95ed', 'ciclismo', 'Madrid Río en bici', 'Ruta llana por Madrid Río, ideal para empezar. Casco obligatorio y lleva agua.', pg_temp.hora_ejemplo(null, 2, '10:00'), 120, 'Puente del Rey', 40.419, -3.721, '[[40.419, -3.721], [40.4115, -3.7195], [40.403, -3.7165], [40.396, -3.709], [40.3925, -3.699], [40.388, -3.693], [40.383, -3.697]]'::jsonb, '18 km/h', 'principiante', 2, 12, 0, '0a096929-4d63-5b26-b6f0-0320490a6b00', true),
  ('edfe16fc-de24-5756-b745-2f0cb15b71de', 'senderismo', 'Casa de Campo: circular desde el lago', 'Unos 9 km entre pinos y encinas. Calzado cómodo y algo de picar para la parada.', pg_temp.hora_ejemplo(null, 2, '09:30'), 180, 'Lago de la Casa de Campo', 40.4183, -3.7357, '[[40.4183, -3.7357], [40.425, -3.748], [40.432, -3.76], [40.425, -3.77], [40.414, -3.762], [40.412, -3.745], [40.4183, -3.7357]]'::jsonb, 'Tranquilo, con paradas', 'todos', 3, 20, 0, '1f833830-c4f9-52f2-ba9b-55b2f729d17b', true),
  ('abd9605e-3397-5c63-836d-29228774d869', 'yoga', 'Yoga al amanecer en el Templo de Debod', 'Sesión guiada de hatha yoga suave. Trae esterilla y ropa de abrigo, que a esa hora refresca.', pg_temp.hora_ejemplo(null, 3, '08:00'), 60, 'Templo de Debod', 40.424, -3.7178, null, '', 'todos', 2, 20, 0, '32edf06a-2d3c-5f30-85e2-519641214275', true),
  ('2605d3ba-9659-5adf-b91a-4f53f40c3926', 'voley', 'Vóley playa en Madrid Río', 'Jugamos 4 contra 4 en la arena. Si somos más, rotamos por sets.', pg_temp.hora_ejemplo(null, 1, '19:00'), 120, 'Playa urbana de Madrid Río', 40.4035, -3.7185, null, '', 'intermedio', 6, 12, 0, 'e17aeebc-b4d7-5f5a-89d2-bc77327d21a7', true),
  ('c9eab28a-b46f-52d1-b130-cc095cd75ad2', 'calistenia', 'Calistenia en Arganzuela', 'Rutina de fuerza en barras: dominadas, fondos y core. Se adaptan los ejercicios a cada uno.', pg_temp.hora_ejemplo(null, 4, '19:30'), 60, 'Parque de calistenia de Arganzuela', 40.3985, -3.702, null, '', 'avanzado', 2, 10, 0, 'aef3281b-175f-579a-9f5d-8a55fb9f66ec', true),
  ('4c0ce1f1-9f66-53a5-81cb-4ab97c1d3fcc', 'futbolsala', 'Fútbol sala en Lavapiés', 'Pista municipal. Ambiente tranquilo, se viene a pasarlo bien.', pg_temp.hora_ejemplo(null, 3, '21:00'), 60, 'Pista de fútbol sala de Lavapiés', 40.4089, -3.701, null, '', 'todos', 8, 10, 3, '12643eb9-437e-5807-aef7-da488c84d2cb', true),
  ('2c56acd0-a1c5-5bd7-b4e9-e1d12dd0ec67', 'running', 'Series en la Dehesa de la Villa', 'Calentamiento, 6 series de 1 km y vuelta a la calma. Para gente que ya corre a menudo.', pg_temp.hora_ejemplo(null, 5, '09:00'), 75, 'Dehesa de la Villa', 40.46, -3.713, '[[40.46, -3.713], [40.4635, -3.7175], [40.4665, -3.714], [40.464, -3.708], [40.46, -3.713]]'::jsonb, '4:45 min/km', 'avanzado', 2, 10, 0, 'd05f544e-7a4c-540b-b5b0-2b4af9657760', true),
  ('4edee422-8ce2-53f9-b772-627af7b602f8', 'patinaje', 'Patines por el Juan Carlos I', 'Vuelta por los caminos asfaltados del parque. Rodilleras recomendadas.', pg_temp.hora_ejemplo(null, 6, '11:00'), 90, 'Parque Juan Carlos I', 40.463, -3.608, '[[40.463, -3.608], [40.4665, -3.6045], [40.469, -3.61], [40.466, -3.616], [40.462, -3.6135], [40.463, -3.608]]'::jsonb, '', 'todos', 2, 12, 0, '6339d9bf-1e8b-5c17-8d5a-c6a5c169a2e9', true);

insert into public.inscripciones (actividad_id, usuario_id, estado, creada) values
  ('02479073-3844-5c94-8b84-fff3774dea23', '09186059-7d09-593b-a6d5-42976e754fae', 'dentro', now() - interval '100 minutes'),
  ('02479073-3844-5c94-8b84-fff3774dea23', '1f833830-c4f9-52f2-ba9b-55b2f729d17b', 'dentro', now() - interval '99 minutes'),
  ('02479073-3844-5c94-8b84-fff3774dea23', '12643eb9-437e-5807-aef7-da488c84d2cb', 'dentro', now() - interval '98 minutes'),
  ('02479073-3844-5c94-8b84-fff3774dea23', 'cddda50c-8ea7-5470-a3b9-bcae5838f173', 'dentro', now() - interval '97 minutes'),
  ('02479073-3844-5c94-8b84-fff3774dea23', '1b10e0ef-30a8-5b4e-91d1-ededdbcc899f', 'dentro', now() - interval '96 minutes'),
  ('02479073-3844-5c94-8b84-fff3774dea23', '32edf06a-2d3c-5f30-85e2-519641214275', 'dentro', now() - interval '95 minutes'),
  ('02479073-3844-5c94-8b84-fff3774dea23', 'dcf0e635-2506-5900-8acc-799f32586f2b', 'dentro', now() - interval '94 minutes'),
  ('02479073-3844-5c94-8b84-fff3774dea23', 'd05f544e-7a4c-540b-b5b0-2b4af9657760', 'dentro', now() - interval '93 minutes'),
  ('02479073-3844-5c94-8b84-fff3774dea23', '1b950305-367d-5560-a839-fcbe7bf7af8d', 'dentro', now() - interval '92 minutes'),
  ('02479073-3844-5c94-8b84-fff3774dea23', '6c261515-862f-5652-86ca-b14664ff00ea', 'dentro', now() - interval '91 minutes'),
  ('02479073-3844-5c94-8b84-fff3774dea23', 'efaecdde-3dbc-5e8f-8d3d-b73cbb204de8', 'dentro', now() - interval '90 minutes'),
  ('7b5d9469-72ba-53d3-87f5-91d5bd13e24b', 'cddda50c-8ea7-5470-a3b9-bcae5838f173', 'dentro', now() - interval '100 minutes'),
  ('7b5d9469-72ba-53d3-87f5-91d5bd13e24b', '1b10e0ef-30a8-5b4e-91d1-ededdbcc899f', 'dentro', now() - interval '99 minutes'),
  ('7b5d9469-72ba-53d3-87f5-91d5bd13e24b', '32edf06a-2d3c-5f30-85e2-519641214275', 'dentro', now() - interval '98 minutes'),
  ('7b5d9469-72ba-53d3-87f5-91d5bd13e24b', 'dcf0e635-2506-5900-8acc-799f32586f2b', 'dentro', now() - interval '97 minutes'),
  ('7b5d9469-72ba-53d3-87f5-91d5bd13e24b', 'd05f544e-7a4c-540b-b5b0-2b4af9657760', 'dentro', now() - interval '96 minutes'),
  ('7b5d9469-72ba-53d3-87f5-91d5bd13e24b', '1b950305-367d-5560-a839-fcbe7bf7af8d', 'dentro', now() - interval '95 minutes'),
  ('acef642d-f93b-555a-a46c-7c96d637fbce', 'dcf0e635-2506-5900-8acc-799f32586f2b', 'dentro', now() - interval '100 minutes'),
  ('acef642d-f93b-555a-a46c-7c96d637fbce', 'd05f544e-7a4c-540b-b5b0-2b4af9657760', 'dentro', now() - interval '99 minutes'),
  ('acef642d-f93b-555a-a46c-7c96d637fbce', '1b950305-367d-5560-a839-fcbe7bf7af8d', 'dentro', now() - interval '98 minutes'),
  ('046c9a8a-1774-5e18-904d-a30299440da3', '6c261515-862f-5652-86ca-b14664ff00ea', 'dentro', now() - interval '100 minutes'),
  ('046c9a8a-1774-5e18-904d-a30299440da3', 'efaecdde-3dbc-5e8f-8d3d-b73cbb204de8', 'dentro', now() - interval '99 minutes'),
  ('046c9a8a-1774-5e18-904d-a30299440da3', '4613831d-d0b5-51d4-9078-055d54f4d137', 'dentro', now() - interval '98 minutes'),
  ('046c9a8a-1774-5e18-904d-a30299440da3', '0a096929-4d63-5b26-b6f0-0320490a6b00', 'dentro', now() - interval '97 minutes'),
  ('046c9a8a-1774-5e18-904d-a30299440da3', 'a5122727-2182-553c-9c4e-2d5801c3f0fd', 'dentro', now() - interval '96 minutes'),
  ('184b1525-6786-5b77-8686-da34701e95ed', '0a096929-4d63-5b26-b6f0-0320490a6b00', 'dentro', now() - interval '100 minutes'),
  ('184b1525-6786-5b77-8686-da34701e95ed', 'a5122727-2182-553c-9c4e-2d5801c3f0fd', 'dentro', now() - interval '99 minutes'),
  ('184b1525-6786-5b77-8686-da34701e95ed', 'e17aeebc-b4d7-5f5a-89d2-bc77327d21a7', 'dentro', now() - interval '98 minutes'),
  ('184b1525-6786-5b77-8686-da34701e95ed', 'd06fd49d-ad53-5242-b75d-b5b861a032c4', 'dentro', now() - interval '97 minutes'),
  ('edfe16fc-de24-5756-b745-2f0cb15b71de', '1f833830-c4f9-52f2-ba9b-55b2f729d17b', 'dentro', now() - interval '100 minutes'),
  ('edfe16fc-de24-5756-b745-2f0cb15b71de', '12643eb9-437e-5807-aef7-da488c84d2cb', 'dentro', now() - interval '99 minutes'),
  ('edfe16fc-de24-5756-b745-2f0cb15b71de', 'cddda50c-8ea7-5470-a3b9-bcae5838f173', 'dentro', now() - interval '98 minutes'),
  ('edfe16fc-de24-5756-b745-2f0cb15b71de', '1b10e0ef-30a8-5b4e-91d1-ededdbcc899f', 'dentro', now() - interval '97 minutes'),
  ('edfe16fc-de24-5756-b745-2f0cb15b71de', '32edf06a-2d3c-5f30-85e2-519641214275', 'dentro', now() - interval '96 minutes'),
  ('edfe16fc-de24-5756-b745-2f0cb15b71de', 'dcf0e635-2506-5900-8acc-799f32586f2b', 'dentro', now() - interval '95 minutes'),
  ('edfe16fc-de24-5756-b745-2f0cb15b71de', 'd05f544e-7a4c-540b-b5b0-2b4af9657760', 'dentro', now() - interval '94 minutes'),
  ('edfe16fc-de24-5756-b745-2f0cb15b71de', '1b950305-367d-5560-a839-fcbe7bf7af8d', 'dentro', now() - interval '93 minutes'),
  ('edfe16fc-de24-5756-b745-2f0cb15b71de', '6c261515-862f-5652-86ca-b14664ff00ea', 'dentro', now() - interval '92 minutes'),
  ('abd9605e-3397-5c63-836d-29228774d869', '32edf06a-2d3c-5f30-85e2-519641214275', 'dentro', now() - interval '100 minutes'),
  ('abd9605e-3397-5c63-836d-29228774d869', 'dcf0e635-2506-5900-8acc-799f32586f2b', 'dentro', now() - interval '99 minutes'),
  ('abd9605e-3397-5c63-836d-29228774d869', 'd05f544e-7a4c-540b-b5b0-2b4af9657760', 'dentro', now() - interval '98 minutes'),
  ('abd9605e-3397-5c63-836d-29228774d869', '1b950305-367d-5560-a839-fcbe7bf7af8d', 'dentro', now() - interval '97 minutes'),
  ('abd9605e-3397-5c63-836d-29228774d869', '6c261515-862f-5652-86ca-b14664ff00ea', 'dentro', now() - interval '96 minutes'),
  ('abd9605e-3397-5c63-836d-29228774d869', 'efaecdde-3dbc-5e8f-8d3d-b73cbb204de8', 'dentro', now() - interval '95 minutes'),
  ('abd9605e-3397-5c63-836d-29228774d869', '4613831d-d0b5-51d4-9078-055d54f4d137', 'dentro', now() - interval '94 minutes'),
  ('abd9605e-3397-5c63-836d-29228774d869', '0a096929-4d63-5b26-b6f0-0320490a6b00', 'dentro', now() - interval '93 minutes'),
  ('abd9605e-3397-5c63-836d-29228774d869', 'a5122727-2182-553c-9c4e-2d5801c3f0fd', 'dentro', now() - interval '92 minutes'),
  ('abd9605e-3397-5c63-836d-29228774d869', 'e17aeebc-b4d7-5f5a-89d2-bc77327d21a7', 'dentro', now() - interval '91 minutes'),
  ('abd9605e-3397-5c63-836d-29228774d869', 'd06fd49d-ad53-5242-b75d-b5b861a032c4', 'dentro', now() - interval '90 minutes'),
  ('abd9605e-3397-5c63-836d-29228774d869', '77b25638-3959-506d-802d-22afa3b3e271', 'dentro', now() - interval '89 minutes'),
  ('2605d3ba-9659-5adf-b91a-4f53f40c3926', 'e17aeebc-b4d7-5f5a-89d2-bc77327d21a7', 'dentro', now() - interval '100 minutes'),
  ('2605d3ba-9659-5adf-b91a-4f53f40c3926', 'd06fd49d-ad53-5242-b75d-b5b861a032c4', 'dentro', now() - interval '99 minutes'),
  ('2605d3ba-9659-5adf-b91a-4f53f40c3926', '77b25638-3959-506d-802d-22afa3b3e271', 'dentro', now() - interval '98 minutes'),
  ('2605d3ba-9659-5adf-b91a-4f53f40c3926', 'aef3281b-175f-579a-9f5d-8a55fb9f66ec', 'dentro', now() - interval '97 minutes'),
  ('c9eab28a-b46f-52d1-b130-cc095cd75ad2', 'aef3281b-175f-579a-9f5d-8a55fb9f66ec', 'dentro', now() - interval '100 minutes'),
  ('c9eab28a-b46f-52d1-b130-cc095cd75ad2', 'ef193ad1-c05a-52a7-8746-8658ceaa43b5', 'dentro', now() - interval '99 minutes'),
  ('c9eab28a-b46f-52d1-b130-cc095cd75ad2', '6339d9bf-1e8b-5c17-8d5a-c6a5c169a2e9', 'dentro', now() - interval '98 minutes'),
  ('4c0ce1f1-9f66-53a5-81cb-4ab97c1d3fcc', '12643eb9-437e-5807-aef7-da488c84d2cb', 'dentro', now() - interval '100 minutes'),
  ('4c0ce1f1-9f66-53a5-81cb-4ab97c1d3fcc', 'cddda50c-8ea7-5470-a3b9-bcae5838f173', 'dentro', now() - interval '99 minutes'),
  ('4c0ce1f1-9f66-53a5-81cb-4ab97c1d3fcc', '1b10e0ef-30a8-5b4e-91d1-ededdbcc899f', 'dentro', now() - interval '98 minutes'),
  ('4c0ce1f1-9f66-53a5-81cb-4ab97c1d3fcc', '32edf06a-2d3c-5f30-85e2-519641214275', 'dentro', now() - interval '97 minutes'),
  ('4c0ce1f1-9f66-53a5-81cb-4ab97c1d3fcc', 'dcf0e635-2506-5900-8acc-799f32586f2b', 'dentro', now() - interval '96 minutes'),
  ('4c0ce1f1-9f66-53a5-81cb-4ab97c1d3fcc', 'd05f544e-7a4c-540b-b5b0-2b4af9657760', 'dentro', now() - interval '95 minutes'),
  ('4c0ce1f1-9f66-53a5-81cb-4ab97c1d3fcc', '1b950305-367d-5560-a839-fcbe7bf7af8d', 'dentro', now() - interval '94 minutes'),
  ('4c0ce1f1-9f66-53a5-81cb-4ab97c1d3fcc', '6c261515-862f-5652-86ca-b14664ff00ea', 'dentro', now() - interval '93 minutes'),
  ('4c0ce1f1-9f66-53a5-81cb-4ab97c1d3fcc', 'efaecdde-3dbc-5e8f-8d3d-b73cbb204de8', 'dentro', now() - interval '92 minutes'),
  ('4c0ce1f1-9f66-53a5-81cb-4ab97c1d3fcc', '4613831d-d0b5-51d4-9078-055d54f4d137', 'dentro', now() - interval '91 minutes'),
  ('4c0ce1f1-9f66-53a5-81cb-4ab97c1d3fcc', '0a096929-4d63-5b26-b6f0-0320490a6b00', 'espera', now() - interval '20 minutes'),
  ('2c56acd0-a1c5-5bd7-b4e9-e1d12dd0ec67', 'd05f544e-7a4c-540b-b5b0-2b4af9657760', 'dentro', now() - interval '100 minutes'),
  ('2c56acd0-a1c5-5bd7-b4e9-e1d12dd0ec67', '1b950305-367d-5560-a839-fcbe7bf7af8d', 'dentro', now() - interval '99 minutes'),
  ('2c56acd0-a1c5-5bd7-b4e9-e1d12dd0ec67', '6c261515-862f-5652-86ca-b14664ff00ea', 'dentro', now() - interval '98 minutes'),
  ('2c56acd0-a1c5-5bd7-b4e9-e1d12dd0ec67', 'efaecdde-3dbc-5e8f-8d3d-b73cbb204de8', 'dentro', now() - interval '97 minutes'),
  ('4edee422-8ce2-53f9-b772-627af7b602f8', '6339d9bf-1e8b-5c17-8d5a-c6a5c169a2e9', 'dentro', now() - interval '100 minutes'),
  ('4edee422-8ce2-53f9-b772-627af7b602f8', 'adbd0c36-fb7e-5003-8cf7-9eed276b9367', 'dentro', now() - interval '99 minutes')
on conflict (actividad_id, usuario_id) do nothing;

insert into public.comentarios (actividad_id, autor_id, texto, creada) values
  ('02479073-3844-5c94-8b84-fff3774dea23', '09186059-7d09-593b-a6d5-42976e754fae', 'Yo llevo balón y petos', now() - interval '40 minutes'),
  ('02479073-3844-5c94-8b84-fff3774dea23', '1f833830-c4f9-52f2-ba9b-55b2f729d17b', '¿Hay vestuarios?', now() - interval '25 minutes'),
  ('02479073-3844-5c94-8b84-fff3774dea23', '09186059-7d09-593b-a6d5-42976e754fae', 'Sí, y duchas con agua caliente', now() - interval '20 minutes');

update public.inscripciones i
set creada = now() - interval '2 hours'
from public.actividades a
where a.id = i.actividad_id and a.ejemplo and i.usuario_id = a.organizador;
