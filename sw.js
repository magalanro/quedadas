self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', evento => evento.waitUntil(self.clients.claim()));

self.addEventListener('push', evento => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch {
    datos = { cuerpo: evento.data ? evento.data.text() : '' };
  }
  const destino = new URL(datos.url || './', self.registration.scope).href;
  evento.waitUntil(self.registration.showNotification(datos.titulo || 'Quedadas', {
    body: datos.cuerpo || '',
    icon: 'iconos/icono-192.png',
    badge: 'iconos/insignia-96.png',
    tag: datos.etiqueta || undefined,
    renotify: !!datos.etiqueta,
    lang: 'es',
    data: { url: destino }
  }));
});

self.addEventListener('notificationclick', evento => {
  evento.notification.close();
  const destino = evento.notification.data?.url || self.registration.scope;
  evento.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const propia = ventanas.find(v => v.url.startsWith(self.registration.scope));
    if (propia) {
      propia.postMessage({ tipo: 'abrir', url: destino });
      return propia.focus();
    }
    return self.clients.openWindow(destino);
  })());
});
