# Quedadas

Una app para encontrar gente con la que hacer deporte cerca de ti: ves en un **mapa** y en una **lista** las quedadas que hay (un partido de fútbol, una ruta de running, una clase de yoga en el parque…), te apuntas, y si no encuentras lo que buscas, creas la tuya.

## Qué puedes hacer

- **Explorar** quedadas en el mapa o en la lista. Las dos vistas están sincronizadas: si tocas un punto del mapa se abre su ficha.
- **Filtrar** por deporte, día (hoy, mañana, este finde, próximos 7 días), nivel, gratis, con plazas libres o solo lo que se ve en el mapa.
- **Ordenar** por cercanía, por hora, por número de apuntados o por "casi completas".
- Ver **"Les falta gente"**: quedadas de las próximas 24 horas a las que les falta poco para llenarse.
- **Apuntarte** y borrarte. Cada quedada tiene un **mínimo** (para que se haga) y un **máximo** de plazas. Si está completa, entras en la **lista de espera** y pasas dentro automáticamente si alguien se borra.
- **Crear quedadas** marcando el punto de encuentro en el mapa y, en running, bici, senderismo o patines, **dibujando la ruta** punto a punto (los kilómetros se calculan solos).
- **Escribir mensajes** al grupo, **copiar el enlace** para invitar a gente, **añadir al calendario** y abrir **cómo llegar**.
- **Mis planes**: todo lo que tienes pendiente, ordenado por día, con aviso de mensajes nuevos.
- **Chat de cada quedada**: solo lo ven las personas apuntadas. Incluye mensajes automáticos ("Ana se ha apuntado", "Ya sois 12: ¡quedada confirmada!"), un aviso fijado por quien organiza ("Pista 3, puerta norte") y el aviso de "está escribiendo…".
- **Avisos en el móvil**: notificaciones aunque la app esté cerrada (1 hora antes, "¿Sigues yendo?", mensajes del chat, plaza desde la lista de espera y quedadas nuevas cerca de los deportes que elijas). En iPhone hay que añadir la app a la pantalla de inicio primero.
- **Entrar con Google**: el botón aparece solo cuando Google está activado en Supabase.
- **Confirmar asistencia**: 3 horas antes te pregunta "¿Sigues yendo?". Si no confirmas y hay gente en lista de espera, una hora antes tu plaza pasa al primero que espera. Así hay menos plantones.

## Modo nube con Supabase (el que se usa ahora)

**Supabase** es un servicio que te da una base de datos en internet y un sistema de cuentas de usuario. Con él, la app guarda las quedadas en la nube: da igual desde qué móvil u ordenador entres, todo el mundo ve lo mismo y cada persona tiene su cuenta con email y contraseña.

- La conexión está en `config.js` (la dirección del proyecto y la clave pública, que no es secreta).
- Los scripts de la base de datos están en la carpeta `supabase/`. Se pegan en Supabase, en **SQL Editor**, y se pulsa **Run**. En un proyecto nuevo, el orden es:
  1. `1-estructura.sql`: tablas, reglas de seguridad y permisos.
  2. `4-chat-y-asistencia.sql`: chat de cada quedada, mensajes automáticos, aviso fijado y confirmación de asistencia.
  3. `5-avisos-y-google.sql`: notificaciones en el móvil y nombre de perfil para quien entra con Google.
  4. `2-ejemplos.sql`: las quedadas de ejemplo.
  (`3-permisos.sql` ya va incluido en el 1; solo hacía falta en proyectos creados antes.)
- Si vuelves a ejecutar `2-ejemplos.sql`, las quedadas de ejemplo se renuevan con fechas de los próximos días. Las quedadas reales no se tocan.
- Los cambios llegan solos y al momento: si alguien se apunta, lo ves sin recargar.

### Cómo funcionan los avisos

1. Al activar los avisos, el navegador crea una **suscripción**: una dirección única de ese móvil en el servicio de notificaciones de Google, Apple o Mozilla. La app la guarda en la tabla `suscripciones_push`.
2. Cuando pasa algo (un mensaje, una plaza libre, falta 1 hora), la base de datos apunta el aviso en `avisos_pendientes` y llama a la función `enviar-avisos`.
3. Esa función (`supabase/functions/enviar-avisos/index.ts`, instalada en Supabase como Edge Function) firma cada aviso con la clave privada VAPID y lo manda al móvil. El archivo `sw.js` de la app lo recibe y lo muestra aunque la app esté cerrada.

Las claves VAPID (las que firman los avisos) las crea la propia función la primera vez y las guarda en la tabla `claves_vapid`, que solo puede leer la función. La app pide la clave pública a la función. Nadie tiene que copiar claves a mano y la privada nunca está en este repositorio.

Si vacías `config.js`, la app vuelve a funcionar en modo local o con `servidor.py`, como se explica abajo.

## Cómo abrirla

Con `config.js` relleno, haz doble clic en `index.html` y ya estás en modo nube. Sin `config.js` hay dos formas más. Las dos usan exactamente los mismos archivos.

### Forma 1: abrir el archivo (la más rápida)

1. Abre la carpeta `App quedadas`.
2. Haz doble clic en `index.html`. Se abre en tu navegador.

Así **todo se guarda solo en tu navegador**: es perfecto para probarla tú, pero otras personas no verán tus quedadas.

### Forma 2: con el servidor (para usarla entre varias personas)

El **servidor** es un pequeño programa que guarda las quedadas en un archivo (`datos.json`) y se las enseña a todo el que se conecte. Así, si tu amigo se apunta desde su móvil, tú lo ves en tu ordenador.

1. Abre una terminal en la carpeta `App quedadas`.
2. Escribe:

   ```
   python3 servidor.py
   ```

3. Verás algo así:

   ```
   En este ordenador:        http://localhost:8000
   Desde otro móvil o PC:    http://192.168.1.40:8000   (misma wifi)
   ```

4. Abre la primera dirección en tu navegador. Pásale la segunda a quien esté en tu misma wifi.
5. Para pararlo, pulsa `Ctrl + C` en la terminal.

Si el puerto 8000 está ocupado, usa otro: `python3 servidor.py 8080`.

> La ubicación ("Centrar en mi ubicación") funciona en `localhost` y al abrir el archivo. Desde otro móvil por la wifi el navegador puede bloquearla porque la dirección no es `https`; el resto de la app funciona igual.

## Qué hay en cada archivo

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La estructura de la página: panel, mapa, botones. |
| `estilos.css` | El aspecto: colores, tipografías, tamaños y la versión para móvil. |
| `app.js` | Toda la lógica: filtros, mapa, crear quedadas, apuntarse, rutas. |
| `datos-ejemplo.js` | 12 quedadas de ejemplo en Madrid. Sus fechas se recalculan para que siempre sean de los próximos días. |
| `servidor.py` | El servidor para el modo compartido. Solo usa Python, sin instalar nada. |
| `vendor/` | Leaflet, la librería que dibuja el mapa, incluida para que no dependa de descargas. |

Los ejemplos están en Madrid. Las quedadas que tú crees aparecen donde las marques, en cualquier ciudad.

## Siguientes pasos para convertirla en una app real

1. **Cuentas de usuario de verdad** (con email o Google) en lugar de solo el nombre.
2. **Publicarla en internet** con una base de datos en la nube (por ejemplo Supabase o Firebase) para que cualquiera pueda usarla desde cualquier sitio.
3. **Notificaciones**: avisar cuando alguien se apunta, cuando falta 1 hora o cuando sales de la lista de espera.
4. **Valoraciones** después de cada quedada y perfiles con tu nivel, para dar confianza.
5. **Quedadas que se repiten** cada semana.
6. **App de móvil instalable** (PWA) para tenerla en la pantalla de inicio.
