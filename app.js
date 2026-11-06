const DEPORTES = {
  futbol: { nombre: 'Fútbol', icono: '⚽', color: '#1E7A4C', plazas: [10, 14], duracion: 90 },
  futbolsala: { nombre: 'Fútbol sala', icono: '🥅', color: '#0F8B8D', plazas: [8, 10], duracion: 60 },
  running: { nombre: 'Running', icono: '🏃', color: '#D7263D', plazas: [2, 15], duracion: 60, ruta: true },
  ciclismo: { nombre: 'Ciclismo', icono: '🚴', color: '#2F5DD3', plazas: [2, 12], duracion: 120, ruta: true },
  senderismo: { nombre: 'Senderismo', icono: '🥾', color: '#8A5A2B', plazas: [3, 20], duracion: 180, ruta: true },
  patinaje: { nombre: 'Patines', icono: '🛼', color: '#C0399A', plazas: [2, 12], duracion: 90, ruta: true },
  baloncesto: { nombre: 'Baloncesto', icono: '🏀', color: '#E07A1F', plazas: [6, 10], duracion: 90 },
  padel: { nombre: 'Pádel', icono: '🎾', color: '#6D43C9', plazas: [4, 4], duracion: 90 },
  voley: { nombre: 'Vóley', icono: '🏐', color: '#C7A008', plazas: [6, 12], duracion: 90 },
  yoga: { nombre: 'Yoga', icono: '🧘', color: '#2E8FA6', plazas: [2, 20], duracion: 60 },
  calistenia: { nombre: 'Calistenia', icono: '💪', color: '#4B5568', plazas: [2, 10], duracion: 60 }
};

const NIVELES = {
  todos: 'Todos los niveles',
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado'
};

const ORIGEN_POR_DEFECTO = { lat: 40.4168, lng: -3.7038 };
const CLAVE_DATOS = 'quedadas.datos.v1';
const CLAVE_USUARIO = 'quedadas.usuario.v1';
const CLAVE_FILTROS = 'quedadas.filtros.v1';
const CLAVE_LEIDOS = 'quedadas.leidos.v1';
const MOVIL = window.matchMedia('(max-width: 820px)');

const estado = {
  almacen: null,
  actividades: [],
  usuario: null,
  origen: { ...ORIGEN_POR_DEFECTO },
  origenEsUsuario: false,
  pestana: 'explorar',
  vista: 'lista',
  seleccion: null,
  modoMovil: 'lista',
  modoMapa: null,
  borrador: null,
  limitesMapa: null,
  scrollLista: 0,
  filtros: {
    texto: '',
    deportes: new Set(),
    cuando: 'todo',
    nivel: 'cualquiera',
    conPlazas: false,
    gratis: false,
    zona: false,
    orden: 'cercania'
  }
};

const $ = (selector, raiz = document) => raiz.querySelector(selector);

function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function nuevoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function leerLocal(clave, defecto) {
  try {
    const valor = localStorage.getItem(clave);
    return valor ? JSON.parse(valor) : defecto;
  } catch {
    return defecto;
  }
}

function guardarLocal(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {}
}

function normalizar(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function distanciaKm(a, b) {
  const rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function longitudRuta(ruta) {
  let total = 0;
  for (let i = 1; i < (ruta?.length || 0); i++) {
    total += distanciaKm({ lat: ruta[i - 1][0], lng: ruta[i - 1][1] }, { lat: ruta[i][0], lng: ruta[i][1] });
  }
  return total;
}

function formatoKm(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`;
}

function formatoPrecio(precio) {
  if (!precio) return 'Gratis';
  return `${Number(precio).toLocaleString('es-ES', { minimumFractionDigits: Number.isInteger(precio) ? 0 : 2, maximumFractionDigits: 2 })} € por persona`;
}

function inicioDia(fecha) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

function diasHasta(fecha) {
  return Math.round((inicioDia(fecha) - inicioDia(new Date())) / 86400000);
}

function etiquetaDia(fecha) {
  const dias = diasHasta(fecha);
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Mañana';
  const texto = fecha.toLocaleDateString('es-ES', dias > 6 ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatoHora(fecha) {
  return fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatoDuracion(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h && m) return `${h} h ${m} min`;
  return h ? `${h} h` : `${m} min`;
}

function cuentaAtras(fecha) {
  const minutos = Math.round((fecha - new Date()) / 60000);
  if (minutos <= 0) return 'Ya ha empezado';
  if (minutos < 60) return `Empieza en ${minutos} min`;
  if (minutos < 720) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return m ? `Empieza en ${h} h ${m} min` : `Empieza en ${h} h`;
  }
  return '';
}

function hace(fechaIso) {
  const minutos = Math.round((Date.now() - new Date(fechaIso)) / 60000);
  if (minutos < 1) return 'ahora';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return new Date(fechaIso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function iniciales(nombre) {
  return String(nombre || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

function colorPersona(id) {
  const tonos = ['#1E7A4C', '#2F5DD3', '#D7263D', '#6D43C9', '#E07A1F', '#0F8B8D', '#C0399A', '#8A5A2B'];
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return tonos[h % tonos.length];
}

function plazas(a) {
  const n = a.apuntados.length;
  return { n, libres: Math.max(0, a.max - n), faltan: Math.max(0, a.min - n), completa: n >= a.max };
}

function haTerminado(a) {
  return new Date(a.inicio).getTime() + a.duracionMin * 60000 < Date.now();
}

function estaApuntado(a) {
  return !!estado.usuario && a.apuntados.some(p => p.id === estado.usuario.id);
}

function estaEnEspera(a) {
  return !!estado.usuario && a.espera.some(p => p.id === estado.usuario.id);
}

function esOrganizador(a) {
  return !!estado.usuario && a.organizador.id === estado.usuario.id;
}

function normalizarActividad(a) {
  a.mensajes = Array.isArray(a.mensajes) ? a.mensajes : (a.comentarios || []).map(c => ({ ...c, tipo: 'texto' }));
  delete a.comentarios;
  a.aviso = a.aviso || '';
  a.apuntados = (a.apuntados || []).map(p => ({ ...p, confirmada: !!p.confirmada || p.id === a.organizador.id }));
  a.espera = (a.espera || []).map(p => ({ ...p, confirmada: !!p.confirmada }));
  return a;
}

function mensajeSistema(a, texto) {
  a.mensajes.push({ id: nuevoId(), tipo: 'sistema', autor: null, texto, fecha: new Date().toISOString() });
}

function avisarSiSeConfirma(a) {
  if (a.min > 1 && a.apuntados.length === a.min) mensajeSistema(a, `Ya sois ${a.min}: ¡quedada confirmada!`);
}

function aplicarApuntarse(a, usuario) {
  if (a.apuntados.some(p => p.id === usuario.id) || a.espera.some(p => p.id === usuario.id)) return;
  const persona = { id: usuario.id, nombre: usuario.nombre, confirmada: new Date(a.inicio) - Date.now() < 3 * 3600000 };
  if (a.apuntados.length < a.max) {
    a.apuntados.push(persona);
    mensajeSistema(a, `${usuario.nombre} se ha apuntado`);
    avisarSiSeConfirma(a);
  } else {
    a.espera.push(persona);
    mensajeSistema(a, `${usuario.nombre} está en la lista de espera`);
  }
}

function aplicarSalir(a, usuario) {
  if (a.organizador.id === usuario.id) throw new Error('Quien organiza no puede borrarse. Si no vas a poder ir, cancela la quedada.');
  const estabaDentro = a.apuntados.some(p => p.id === usuario.id);
  const estabaEnEspera = a.espera.some(p => p.id === usuario.id);
  a.apuntados = a.apuntados.filter(p => p.id !== usuario.id);
  a.espera = a.espera.filter(p => p.id !== usuario.id);
  if (estabaDentro) mensajeSistema(a, `${usuario.nombre} ya no puede ir`);
  else if (estabaEnEspera) mensajeSistema(a, `${usuario.nombre} ha salido de la lista de espera`);
  while (a.apuntados.length < a.max && a.espera.length) {
    const siguiente = a.espera.shift();
    a.apuntados.push(siguiente);
    mensajeSistema(a, `${siguiente.nombre} entra desde la lista de espera`);
    avisarSiSeConfirma(a);
  }
}

function aplicarConfirmar(a, usuario) {
  const persona = a.apuntados.find(p => p.id === usuario.id) || a.espera.find(p => p.id === usuario.id);
  if (!persona) throw new Error('No estás apuntado a esta quedada.');
  persona.confirmada = true;
}

function aplicarAviso(a, usuario, aviso) {
  if (a.organizador.id !== usuario.id) throw new Error('Solo quien organiza puede fijar avisos.');
  a.aviso = String(aviso || '').trim().slice(0, 200);
  if (a.aviso) mensajeSistema(a, `Aviso fijado: ${a.aviso}`);
}

function aplicarLiberar(a) {
  const falta = new Date(a.inicio) - Date.now();
  if (falta <= 0 || falta > 3600000 || !a.espera.length) return false;
  const sinConfirmar = a.apuntados.filter(p => !p.confirmada && p.id !== a.organizador.id).reverse();
  const esperando = [...a.espera];
  let cambiado = false;
  for (const persona of sinConfirmar) {
    const siguiente = esperando.shift();
    if (!siguiente) break;
    a.apuntados = a.apuntados.filter(p => p.id !== persona.id);
    a.espera = a.espera.filter(p => p.id !== siguiente.id);
    a.espera.push({ ...persona, confirmada: false });
    a.apuntados.push({ ...siguiente, confirmada: true });
    mensajeSistema(a, `${persona.nombre} pasa a la lista de espera por no confirmar`);
    mensajeSistema(a, `${siguiente.nombre} entra desde la lista de espera`);
    cambiado = true;
  }
  return cambiado;
}

function fechaEjemplo(e) {
  const d = new Date();
  if (e.enHoras != null) {
    d.setTime(d.getTime() + e.enHoras * 3600000);
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    if (d.getHours() < 8) d.setHours(8 + e.enHoras, 0, 0, 0);
  } else {
    const [h, m] = e.hora.split(':').map(Number);
    d.setDate(d.getDate() + e.diasDesdeHoy);
    d.setHours(h, m, 0, 0);
  }
  return d;
}

function construirEjemplos() {
  return (window.DATOS_EJEMPLO || []).map(e => {
    const { diasDesdeHoy, hora, enHoras, ...resto } = e;
    return {
      ...resto,
      inicio: fechaEjemplo(e).toISOString(),
      creada: new Date().toISOString(),
      mensajes: (resto.mensajes || []).map(({ haceMin, ...m }) => ({ ...m, fecha: new Date(Date.now() - haceMin * 60000).toISOString() }))
    };
  });
}

class AlmacenLocal {
  constructor() {
    this.modo = 'local';
    this.asistencia = true;
    this.datos = [];
  }

  async iniciar() {
    let datos = leerLocal(CLAVE_DATOS, []);
    if (!Array.isArray(datos)) datos = [];
    const ejemplosVivos = datos.filter(a => a.id.startsWith('ej-') && !haTerminado(a)).length;
    if (ejemplosVivos < 4) datos = [...construirEjemplos(), ...datos.filter(a => !a.id.startsWith('ej-'))];
    this.datos = datos.map(normalizarActividad);
    this.guardar();
  }

  guardar() {
    guardarLocal(CLAVE_DATOS, this.datos);
  }

  buscar(id) {
    const a = this.datos.find(x => x.id === id);
    if (!a) throw new Error('Esa quedada ya no existe.');
    return a;
  }

  async listar() {
    if (this.datos.map(aplicarLiberar).some(Boolean)) this.guardar();
    return JSON.parse(JSON.stringify(this.datos));
  }

  async crear(datos) {
    const a = { ...datos, aviso: '', id: nuevoId(), creada: new Date().toISOString(), apuntados: [{ ...datos.organizador, confirmada: true }], espera: [], mensajes: [] };
    this.datos.push(a);
    this.guardar();
    return a;
  }

  async apuntarse(id, usuario) {
    aplicarApuntarse(this.buscar(id), usuario);
    this.guardar();
  }

  async salir(id, usuario) {
    aplicarSalir(this.buscar(id), usuario);
    this.guardar();
  }

  async escribir(id, usuario, texto) {
    this.buscar(id).mensajes.push({ id: nuevoId(), tipo: 'texto', autor: { id: usuario.id, nombre: usuario.nombre }, texto, fecha: new Date().toISOString() });
    this.guardar();
  }

  async confirmar(id, usuario) {
    aplicarConfirmar(this.buscar(id), usuario);
    this.guardar();
  }

  async fijarAviso(id, usuario, aviso) {
    aplicarAviso(this.buscar(id), usuario, aviso);
    this.guardar();
  }

  async cancelar(id, usuario) {
    const a = this.buscar(id);
    if (a.organizador.id !== usuario.id) throw new Error('Solo quien la organiza puede cancelarla.');
    this.datos = this.datos.filter(x => x.id !== id);
    this.guardar();
  }
}

class AlmacenApi {
  constructor() {
    this.modo = 'compartido';
    this.asistencia = true;
  }

  async pedir(ruta, opciones = {}) {
    const respuesta = await fetch('api/' + ruta, {
      method: opciones.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opciones.body ? JSON.stringify(opciones.body) : undefined
    });
    const json = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw new Error(json.error || 'El servidor no ha podido completar la acción.');
    return json;
  }

  async iniciar() {}

  async listar() {
    return (await this.pedir('actividades')).map(normalizarActividad);
  }

  crear(datos) {
    return this.pedir('actividades', { method: 'POST', body: datos });
  }

  apuntarse(id, usuario) {
    return this.pedir(`actividades/${id}/apuntarse`, { method: 'POST', body: { usuario } });
  }

  salir(id, usuario) {
    return this.pedir(`actividades/${id}/salir`, { method: 'POST', body: { usuario } });
  }

  escribir(id, usuario, texto) {
    return this.pedir(`actividades/${id}/mensajes`, { method: 'POST', body: { usuario, texto } });
  }

  confirmar(id, usuario) {
    return this.pedir(`actividades/${id}/confirmar`, { method: 'POST', body: { usuario } });
  }

  fijarAviso(id, usuario, aviso) {
    return this.pedir(`actividades/${id}/aviso`, { method: 'POST', body: { usuario, aviso } });
  }

  cancelar(id, usuario) {
    return this.pedir(`actividades/${id}`, { method: 'DELETE', body: { usuario } });
  }
}

function traducirError(error) {
  const mensaje = String(error?.message || error || '');
  const traducciones = [
    [/invalid login credentials/i, 'El email o la contraseña no son correctos.'],
    [/user already registered|already been registered/i, 'Ya hay una cuenta con ese email. Entra en vez de crear una nueva.'],
    [/email not confirmed/i, 'Falta confirmar tu email: abre el correo que te hemos enviado.'],
    [/password should be at least|password.*characters/i, 'La contraseña tiene que tener al menos 6 caracteres.'],
    [/rate limit|too many requests|security purposes/i, 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.'],
    [/unable to validate email|invalid email|email address.*invalid/i, 'Ese email no parece válido.'],
    [/signups not allowed|signup is disabled/i, 'Ahora mismo no se pueden crear cuentas nuevas.'],
    [/row-level security|permission denied/i, 'No tienes permiso para hacer eso.'],
    [/failed to fetch|networkerror|load failed/i, 'No hay conexión con el servidor. Revisa tu internet.']
  ];
  for (const [patron, texto] of traducciones) if (patron.test(mensaje)) return texto;
  return mensaje || 'Algo ha fallado. Vuelve a intentarlo.';
}

class AlmacenSupabase {
  constructor(config) {
    this.modo = 'nube';
    this.requiereCuenta = true;
    this.config = config;
    this.cliente = window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true }
    });
    this.google = false;
    this.vapidPublica = config.vapidPublica || '';
    this.urlAvisos = `${config.supabaseUrl}/functions/v1/enviar-avisos`;
    this.temporizador = null;
    this.chat = null;
    this.asistencia = false;
    this.canalChat = null;
    this.ultimoAvisoEscribiendo = 0;
  }

  async iniciar() {
    const parametros = new URLSearchParams(location.search);
    const errorAcceso = parametros.get('error_description') || parametros.get('error');
    const ajustes = fetch(`${this.config.supabaseUrl}/auth/v1/settings`, { headers: { apikey: this.config.supabaseKey } })
      .then(r => r.ok ? r.json() : {})
      .then(j => { this.google = !!j?.external?.google; })
      .catch(() => {});
    const { data } = await this.cliente.auth.getSession();
    await this.cargarUsuario(data.session);
    if (parametros.has('code') || errorAcceso) {
      history.replaceState(null, '', location.pathname + location.hash);
      if (errorAcceso) setTimeout(() => avisar(`No se ha podido entrar con Google: ${errorAcceso}`, 'error'), 300);
    }
    try {
      const volver = sessionStorage.getItem('quedadas.volver');
      if (volver) {
        sessionStorage.removeItem('quedadas.volver');
        if (!location.hash && /^#a-[\w-]+$/.test(volver)) history.replaceState(null, '', location.pathname + volver);
      }
    } catch {}
    await ajustes;
    this.cliente.auth.onAuthStateChange((evento, sesion) => {
      if (evento === 'INITIAL_SESSION') return;
      setTimeout(async () => {
        const antes = estado.usuario?.id;
        await this.cargarUsuario(sesion);
        if (antes !== estado.usuario?.id) {
          await refrescar();
          pintarVista();
          avisosMovil.sincronizar();
        }
      }, 0);
    });
    this.cliente
      .channel('cambios-quedadas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'actividades' }, () => this.cambio())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inscripciones' }, () => this.cambio())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comentarios' }, () => this.cambio())
      .subscribe();
    this.cliente
      .channel('cambios-chat')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensajes' }, () => this.cambio())
      .subscribe();
  }

  abrirCanalChat(id, alVerEscribir) {
    if (this.canalChat?.idActividad === id) return;
    this.cerrarCanalChat();
    const canal = this.cliente.channel(`chat-${id}`, { config: { broadcast: { self: false } } });
    canal.on('broadcast', { event: 'escribiendo' }, ({ payload }) => {
      if (payload?.id !== estado.usuario?.id) alVerEscribir(payload?.nombre || 'Alguien');
    });
    canal.subscribe();
    canal.idActividad = id;
    this.canalChat = canal;
  }

  cerrarCanalChat() {
    if (!this.canalChat) return;
    this.cliente.removeChannel(this.canalChat);
    this.canalChat = null;
  }

  avisarEscribiendo() {
    if (!this.canalChat || !estado.usuario || Date.now() - this.ultimoAvisoEscribiendo < 2000) return;
    this.ultimoAvisoEscribiendo = Date.now();
    this.canalChat.send({ type: 'broadcast', event: 'escribiendo', payload: { id: estado.usuario.id, nombre: estado.usuario.nombre } });
  }

  cambio() {
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(sondear, 400);
  }

  async cargarUsuario(sesion) {
    if (!sesion?.user) {
      estado.usuario = null;
      return;
    }
    const usuario = sesion.user;
    let { data: perfil } = await this.cliente.from('perfiles').select('id, nombre').eq('id', usuario.id).maybeSingle();
    if (!perfil) {
      const nombre = (usuario.user_metadata?.nombre || usuario.email?.split('@')[0] || 'Sin nombre').slice(0, 30);
      const { data } = await this.cliente.from('perfiles').insert({ id: usuario.id, nombre }).select('id, nombre').single();
      perfil = data || { id: usuario.id, nombre };
    }
    estado.usuario = { id: usuario.id, nombre: perfil.nombre, email: usuario.email, proveedor: usuario.app_metadata?.provider || 'email' };
  }

  async entrarConGoogle() {
    try {
      sessionStorage.setItem('quedadas.volver', location.hash);
    } catch {}
    const { error } = await this.cliente.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } }
    });
    if (error) throw new Error(traducirError(error));
  }

  async obtenerClaveVapid() {
    if (this.vapidPublica) return this.vapidPublica;
    try {
      const respuesta = await fetch(`${this.urlAvisos}?clave`);
      const json = await respuesta.json();
      if (respuesta.ok && json.publica) {
        this.vapidPublica = json.publica;
        return json.publica;
      }
    } catch {}
    throw new Error('Los avisos todavía no están instalados en Supabase (falta la función enviar-avisos).');
  }

  async guardarSuscripcion(endpoint, p256dh, auth) {
    const { error } = await this.cliente.rpc('guardar_suscripcion', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth });
    if (error) throw new Error(/function|schema cache|could not find/i.test(error.message) ? 'Los avisos todavía no están activados en la base de datos (falta el script 5).' : traducirError(error));
  }

  async borrarSuscripcion(endpoint) {
    await this.cliente.rpc('borrar_suscripcion', { p_endpoint: endpoint }).then(() => {}, () => {});
  }

  async leerPreferencias() {
    const { data } = await this.cliente.from('preferencias_avisos').select('*').eq('usuario_id', estado.usuario.id).maybeSingle();
    return data;
  }

  async guardarPreferencias(preferencias) {
    const { error } = await this.cliente.from('preferencias_avisos').upsert({ ...preferencias, usuario_id: estado.usuario.id, actualizada: new Date().toISOString() }, { onConflict: 'usuario_id' });
    if (error) throw new Error(traducirError(error));
  }

  async entrar(email, contrasena) {
    const { error } = await this.cliente.auth.signInWithPassword({ email, password: contrasena });
    if (error) throw new Error(traducirError(error));
    const { data } = await this.cliente.auth.getSession();
    await this.cargarUsuario(data.session);
    return true;
  }

  async registrarse(nombre, email, contrasena) {
    const opciones = { data: { nombre } };
    if (location.protocol.startsWith('http')) opciones.emailRedirectTo = location.href.split('#')[0];
    const { data, error } = await this.cliente.auth.signUp({ email, password: contrasena, options: opciones });
    if (error) throw new Error(traducirError(error));
    if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) {
      throw new Error('Ya hay una cuenta con ese email. Entra en vez de crear una nueva.');
    }
    if (!data.session) return false;
    await this.cargarUsuario(data.session);
    return true;
  }

  async cerrarSesion() {
    await avisosMovil.olvidarEnEsteDispositivo();
    await this.cliente.auth.signOut();
    estado.usuario = null;
  }

  async cambiarNombre(nombre) {
    const { error } = await this.cliente.from('perfiles').update({ nombre }).eq('id', estado.usuario.id);
    if (error) throw new Error(traducirError(error));
    estado.usuario.nombre = nombre;
  }

  convertir(f) {
    const porFecha = (x, y) => new Date(x.creada) - new Date(y.creada);
    const persona = i => ({ id: i.usuario_id, nombre: i.perfil?.nombre || 'Alguien', confirmada: !!i.confirmada || i.usuario_id === f.organizador });
    const mensajes = this.chat
      ? [...(f.mensajes || [])].sort(porFecha).map(m => ({ id: m.id, tipo: m.tipo, autor: m.tipo === 'sistema' ? null : { id: m.autor?.id, nombre: m.autor?.nombre || 'Alguien' }, texto: m.texto, fecha: m.creada }))
      : [...(f.comentarios || [])].sort(porFecha).map(c => ({ id: c.id, tipo: 'texto', autor: { id: c.autor?.id, nombre: c.autor?.nombre || 'Alguien' }, texto: c.texto, fecha: c.creada }));
    const inscripciones = [...(f.inscripciones || [])].sort(porFecha);
    return {
      id: f.id,
      deporte: f.deporte,
      titulo: f.titulo,
      descripcion: f.descripcion,
      inicio: f.inicio,
      duracionMin: f.duracion_min,
      lugar: { nombre: f.lugar_nombre, lat: f.lat, lng: f.lng },
      ruta: f.ruta,
      ritmo: f.ritmo,
      nivel: f.nivel,
      min: f.min,
      max: f.max,
      precio: Number(f.precio),
      organizador: { id: f.organizador, nombre: f.organizador_perfil?.nombre || 'Alguien' },
      apuntados: inscripciones.filter(i => i.estado === 'dentro').map(persona),
      espera: inscripciones.filter(i => i.estado === 'espera').map(persona),
      aviso: f.aviso || '',
      mensajes,
      creada: f.creada
    };
  }

  consulta(conChat) {
    const desde = new Date(Date.now() - 12 * 3600000).toISOString();
    const campos = conChat
      ? '*, organizador_perfil:perfiles!organizador(id, nombre), inscripciones(usuario_id, estado, confirmada, creada, perfil:perfiles(id, nombre)), mensajes(id, tipo, texto, creada, autor:perfiles(id, nombre))'
      : '*, organizador_perfil:perfiles!organizador(id, nombre), inscripciones(usuario_id, estado, creada, perfil:perfiles(id, nombre)), comentarios(id, texto, creada, autor:perfiles(id, nombre))';
    return this.cliente.from('actividades').select(campos).gte('inicio', desde).order('inicio').limit(500);
  }

  async listar() {
    let respuesta = await this.consulta(this.chat !== false);
    if (respuesta.error && this.chat !== false) {
      const antigua = await this.consulta(false);
      if (!antigua.error) {
        this.chat = false;
        this.asistencia = false;
        respuesta = antigua;
      }
    } else if (!respuesta.error && this.chat === null) {
      this.chat = true;
      this.asistencia = true;
    }
    if (respuesta.error) throw new Error(traducirError(respuesta.error));
    return respuesta.data.map(f => this.convertir(f));
  }

  async crear(datos) {
    const { data, error } = await this.cliente.from('actividades').insert({
      deporte: datos.deporte,
      titulo: datos.titulo,
      descripcion: datos.descripcion,
      inicio: datos.inicio,
      duracion_min: datos.duracionMin,
      lugar_nombre: datos.lugar.nombre,
      lat: datos.lugar.lat,
      lng: datos.lugar.lng,
      ruta: datos.ruta,
      ritmo: datos.ritmo,
      nivel: datos.nivel,
      min: datos.min,
      max: datos.max,
      precio: datos.precio
    }).select('id').single();
    if (error) throw new Error(traducirError(error));
    return data;
  }

  async apuntarse(id) {
    const { error } = await this.cliente.rpc('apuntarse', { p_actividad: id });
    if (error) throw new Error(traducirError(error));
  }

  async salir(id) {
    const { error } = await this.cliente.rpc('salir', { p_actividad: id });
    if (error) throw new Error(traducirError(error));
  }

  async escribir(id, usuario, texto) {
    const { error } = this.chat
      ? await this.cliente.from('mensajes').insert({ actividad_id: id, texto })
      : await this.cliente.from('comentarios').insert({ actividad_id: id, texto });
    if (error) throw new Error(traducirError(error));
  }

  async confirmar(id) {
    const { error } = await this.cliente.rpc('confirmar', { p_actividad: id, p_va: true });
    if (error) throw new Error(traducirError(error));
  }

  async fijarAviso(id, usuario, aviso) {
    const { data, error } = await this.cliente.from('actividades').update({ aviso: String(aviso || '').trim().slice(0, 200) }).eq('id', id).select('id');
    if (error) throw new Error(traducirError(error));
    if (!data?.length) throw new Error('Solo quien organiza puede fijar avisos.');
  }

  async cancelar(id) {
    const { data, error } = await this.cliente.from('actividades').delete().eq('id', id).select('id');
    if (error) throw new Error(traducirError(error));
    if (!data?.length) throw new Error('Solo quien la organiza puede cancelarla.');
  }
}

function base64UrlABytes(texto) {
  const relleno = '='.repeat((4 - texto.length % 4) % 4);
  const binario = atob((texto + relleno).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binario, c => c.charCodeAt(0));
}

const avisosMovil = {
  registro: null,
  estado: 'no-disponible',

  soportado() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  },

  esIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  },

  instalada() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  },

  configurado() {
    const seguro = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
    return seguro && !!estado.almacen?.guardarSuscripcion;
  },

  async obtenerRegistro() {
    if (!this.registro) this.registro = await navigator.serviceWorker.register('sw.js');
    return this.registro;
  },

  async suscripcionActual() {
    if (!this.soportado()) return null;
    const registro = await navigator.serviceWorker.getRegistration();
    return registro ? registro.pushManager.getSubscription() : null;
  },

  async calcularEstado() {
    let resultado;
    if (!this.configurado()) resultado = 'no-disponible';
    else if (this.esIOS() && !this.instalada()) resultado = 'ios-instalar';
    else if (!this.soportado()) resultado = 'no-soportado';
    else if (Notification.permission === 'denied') resultado = 'bloqueado';
    else if (Notification.permission === 'granted' && await this.suscripcionActual()) resultado = 'activado';
    else resultado = 'desactivado';
    this.estado = resultado;
    return resultado;
  },

  async activar() {
    if (!estado.usuario) throw new Error('Entra con tu cuenta para activar los avisos.');
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') {
      await this.calcularEstado();
      throw new Error(permiso === 'denied'
        ? 'Has bloqueado las notificaciones. Permítelas en los ajustes del navegador para esta web.'
        : 'No se han activado las notificaciones.');
    }
    const clave = base64UrlABytes(await estado.almacen.obtenerClaveVapid());
    const registro = await this.obtenerRegistro();
    await navigator.serviceWorker.ready;
    let suscripcion = await registro.pushManager.getSubscription();
    const claveActual = suscripcion?.options?.applicationServerKey;
    if (suscripcion && claveActual && new Uint8Array(claveActual).join() !== clave.join()) {
      await suscripcion.unsubscribe();
      suscripcion = null;
    }
    if (!suscripcion) {
      suscripcion = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
    }
    const datos = suscripcion.toJSON();
    await estado.almacen.guardarSuscripcion(datos.endpoint, datos.keys.p256dh, datos.keys.auth);
    await this.calcularEstado();
  },

  async desactivar() {
    const suscripcion = await this.suscripcionActual();
    if (suscripcion) {
      await estado.almacen.borrarSuscripcion(suscripcion.endpoint);
      await suscripcion.unsubscribe();
    }
    await this.calcularEstado();
  },

  async olvidarEnEsteDispositivo() {
    try {
      const suscripcion = await this.suscripcionActual();
      if (suscripcion) await estado.almacen.borrarSuscripcion(suscripcion.endpoint);
    } catch {}
  },

  async sincronizar() {
    try {
      if (this.configurado() && this.soportado()) await this.obtenerRegistro();
      await this.calcularEstado();
      if (this.estado === 'activado' && estado.usuario) {
        const datos = (await this.suscripcionActual()).toJSON();
        await estado.almacen.guardarSuscripcion(datos.endpoint, datos.keys.p256dh, datos.keys.auth);
      }
    } catch {}
  }
};

async function elegirAlmacen() {
  const config = window.QUEDADAS_CONFIG;
  if (config?.supabaseUrl && config?.supabaseKey && window.supabase?.createClient) {
    return new AlmacenSupabase(config);
  }
  if (location.protocol.startsWith('http')) {
    try {
      const control = new AbortController();
      const temporizador = setTimeout(() => control.abort(), 1500);
      const respuesta = await fetch('api/salud', { signal: control.signal });
      clearTimeout(temporizador);
      if (respuesta.ok) return new AlmacenApi();
    } catch {}
  }
  return new AlmacenLocal();
}

async function refrescar() {
  try {
    estado.actividades = await estado.almacen.listar();
  } catch (error) {
    avisar('No se han podido cargar las quedadas. Comprueba que el servidor sigue encendido.', 'error');
  }
}

function avisar(texto, tipo = 'ok') {
  const el = document.createElement('div');
  el.className = `aviso ${tipo}`;
  el.textContent = texto;
  $('#avisos').append(el);
  setTimeout(() => el.classList.add('saliendo'), 2800);
  setTimeout(() => el.remove(), 3200);
}

function abrirModal(html, alMontar) {
  const capa = $('#modal');
  capa.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  capa.hidden = false;
  alMontar?.(capa);
  capa.querySelector('input, textarea, .boton.primario, button')?.focus();
}

function cerrarModal() {
  const capa = $('#modal');
  capa.hidden = true;
  capa.innerHTML = '';
  capa.onCerrar?.();
  capa.onCerrar = null;
}

function pedirNombre(motivo) {
  return new Promise(resolver => {
    const textoModo = estado.almacen?.modo === 'compartido'
      ? 'Estás conectado a un servidor: todas las personas que abran esta dirección verán las mismas quedadas.'
      : 'Estás en modo local: las quedadas se guardan solo en este navegador. Para compartirlas con más gente, arranca el servidor (mira el README).';
    abrirModal(`
      <h2>${estado.usuario ? 'Tu perfil' : '¿Cómo te llamas?'}</h2>
      <p>${esc(motivo || 'Es el nombre que verá la gente de tus quedadas.')}</p>
      <form id="form-nombre">
        <label class="campo"><span>Tu nombre</span><input name="nombre" required maxlength="30" autocomplete="given-name" value="${esc(estado.usuario?.nombre || '')}"></label>
        <p class="nota">${esc(textoModo)}</p>
        <div class="acciones-modal">
          <button type="button" class="boton secundario" data-cerrar>Ahora no</button>
          <button class="boton primario">Guardar nombre</button>
        </div>
      </form>`, capa => {
      capa.onCerrar = () => resolver(estado.usuario);
      capa.querySelector('[data-cerrar]').onclick = cerrarModal;
      capa.querySelector('form').onsubmit = e => {
        e.preventDefault();
        const nombre = e.target.nombre.value.trim();
        if (!nombre) return;
        estado.usuario = { id: estado.usuario?.id || nuevoId(), nombre };
        guardarLocal(CLAVE_USUARIO, estado.usuario);
        pintarUsuario();
        avisar(`Hola, ${nombre}`);
        cerrarModal();
      };
    });
  });
}

function abrirAcceso(motivo, modoInicial = 'entrar') {
  return new Promise(resolver => {
    let modo = modoInicial;
    const pintar = capa => {
      const crear = modo === 'crear';
      capa.querySelector('.modal').innerHTML = `
        <h2>${crear ? 'Crea tu cuenta' : 'Entra en Quedadas'}</h2>
        <p>${esc(motivo || 'Con tu cuenta puedes apuntarte, crear quedadas y escribir al grupo desde cualquier dispositivo.')}</p>
        ${estado.almacen?.google ? `
          <button type="button" class="boton secundario grande ancho boton-google" data-google>Continuar con Google</button>
          <p class="separador-acceso"><span>o con tu email</span></p>` : ''}
        <div class="selector-acceso" role="tablist">
          <button type="button" role="tab" aria-selected="${!crear}" data-modo-acceso="entrar">Ya tengo cuenta</button>
          <button type="button" role="tab" aria-selected="${crear}" data-modo-acceso="crear">Soy nuevo</button>
        </div>
        <form id="form-acceso" novalidate>
          ${crear ? '<label class="campo"><span>Tu nombre</span><input name="nombre" required maxlength="30" autocomplete="given-name"></label>' : ''}
          <label class="campo"><span>Email</span><input name="email" type="email" required autocomplete="email" inputmode="email"></label>
          <label class="campo"><span>Contraseña</span><input name="contrasena" type="password" required minlength="6" autocomplete="${crear ? 'new-password' : 'current-password'}">${crear ? '<small class="ayuda">Mínimo 6 caracteres.</small>' : ''}</label>
          <p class="error-form" id="error-acceso" role="alert" hidden></p>
          <div class="acciones-modal">
            <button type="button" class="boton secundario" data-cerrar>Ahora no</button>
            <button class="boton primario" id="enviar-acceso">${crear ? 'Crear cuenta' : 'Entrar'}</button>
          </div>
        </form>`;
      capa.querySelector('[data-google]')?.addEventListener('click', async ev => {
        const boton = ev.currentTarget;
        boton.disabled = true;
        boton.textContent = 'Abriendo Google…';
        try {
          await estado.almacen.entrarConGoogle();
        } catch (err) {
          boton.disabled = false;
          boton.textContent = 'Continuar con Google';
          const error = capa.querySelector('#error-acceso');
          error.textContent = traducirError(err);
          error.hidden = false;
        }
      });
      capa.querySelectorAll('[data-modo-acceso]').forEach(b => {
        b.onclick = () => { modo = b.dataset.modoAcceso; pintar(capa); };
      });
      capa.querySelector('[data-cerrar]').onclick = cerrarModal;
      capa.querySelector('form').onsubmit = async e => {
        e.preventDefault();
        const f = e.target;
        const error = capa.querySelector('#error-acceso');
        const boton = capa.querySelector('#enviar-acceso');
        const mostrar = texto => { error.textContent = texto; error.hidden = false; };
        const email = f.email.value.trim();
        const contrasena = f.contrasena.value;
        const nombre = f.nombre?.value.trim();
        if (crear && !nombre) return mostrar('Escribe tu nombre: es lo que verá la gente de tus quedadas.');
        if (!/^\S+@\S+\.\S+$/.test(email)) return mostrar('Ese email no parece válido.');
        if (contrasena.length < 6) return mostrar('La contraseña tiene que tener al menos 6 caracteres.');
        boton.disabled = true;
        boton.textContent = crear ? 'Creando cuenta…' : 'Entrando…';
        try {
          if (crear) {
            const dentro = await estado.almacen.registrarse(nombre, email, contrasena);
            if (!dentro) {
              capa.querySelector('.modal').innerHTML = `
                <h2>Revisa tu correo</h2>
                <p>Te hemos enviado un enlace a <strong>${esc(email)}</strong> para confirmar la cuenta. Ábrelo y después vuelve aquí y entra con tu email y contraseña.</p>
                <div class="acciones-modal"><button class="boton primario" data-cerrar>Entendido</button></div>`;
              capa.querySelector('[data-cerrar]').onclick = cerrarModal;
              return;
            }
          } else {
            await estado.almacen.entrar(email, contrasena);
          }
          pintarUsuario();
          avisar(`Hola, ${estado.usuario.nombre}`);
          cerrarModal();
        } catch (err) {
          mostrar(traducirError(err));
          boton.disabled = false;
          boton.textContent = crear ? 'Crear cuenta' : 'Entrar';
        }
      };
      capa.querySelector('input')?.focus();
    };
    abrirModal('', capa => {
      capa.onCerrar = () => resolver(estado.usuario);
      pintar(capa);
    });
  });
}

function abrirPerfilNube() {
  abrirModal(`
    <h2>Tu perfil</h2>
    <p>${estado.usuario.proveedor === 'google' ? 'Has entrado con Google' : 'Has entrado'} como <strong>${esc(estado.usuario.email || '')}</strong>.</p>
    ${avisosMovil.configurado() ? `
      <button type="button" class="fila-ajuste" data-abrir-avisos>
        <span class="icono-ajuste" aria-hidden="true">🔔</span>
        <span><strong>Avisos en el móvil</strong><small>${avisosMovil.estado === 'activado' ? 'Activados en este dispositivo' : 'Desactivados'}</small></span>
        <span aria-hidden="true" class="flecha-ajuste">›</span>
      </button>` : ''}
    <form id="form-perfil">
      <label class="campo"><span>Tu nombre</span><input name="nombre" required maxlength="30" value="${esc(estado.usuario.nombre)}"></label>
      <p class="error-form" id="error-perfil" role="alert" hidden></p>
      <div class="acciones-modal separadas">
        <button type="button" class="boton peligro" data-salir>Cerrar sesión</button>
        <button class="boton primario">Guardar nombre</button>
      </div>
    </form>`, capa => {
    capa.querySelector('[data-abrir-avisos]')?.addEventListener('click', () => abrirAvisos());
    capa.querySelector('[data-salir]').onclick = async () => {
      await estado.almacen.cerrarSesion();
      cerrarModal();
      await refrescar();
      pintarVista();
      avisar('Has cerrado sesión');
    };
    capa.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      const nombre = e.target.nombre.value.trim();
      if (!nombre) return;
      try {
        await estado.almacen.cambiarNombre(nombre);
        cerrarModal();
        await refrescar();
        pintarVista();
        avisar('Nombre guardado');
      } catch (err) {
        const error = capa.querySelector('#error-perfil');
        error.textContent = traducirError(err);
        error.hidden = false;
      }
    };
  });
}

const PREFERENCIAS_POR_DEFECTO = { recordatorios: true, chat: true, plazas: true, nuevas: false, deportes: [], radio_km: 5 };

function textoEstadoAvisos(estadoAvisos) {
  const textos = {
    'no-disponible': '<p>Los avisos funcionan en la app publicada (<strong>magalanro.github.io/quedadas</strong>) y con tu cuenta iniciada.</p>',
    'ios-instalar': `
      <p>En iPhone y iPad los avisos solo funcionan si Quedadas está en tu pantalla de inicio:</p>
      <ol class="pasos-modal">
        <li>Pulsa el botón <strong>Compartir</strong> de Safari (el cuadrado con la flecha).</li>
        <li>Elige <strong>Añadir a pantalla de inicio</strong>.</li>
        <li>Abre Quedadas desde el icono nuevo y vuelve aquí.</li>
      </ol>`,
    'no-soportado': '<p>Este navegador no permite notificaciones. Prueba con Chrome, Edge, Firefox o Safari actualizados.</p>',
    'bloqueado': '<p>Las notificaciones están <strong>bloqueadas</strong> para esta web. Permítelas en los ajustes del navegador (en el candado junto a la dirección, apartado Notificaciones) y vuelve a intentarlo.</p>'
  };
  return textos[estadoAvisos] || '';
}

async function abrirAvisos() {
  await avisosMovil.calcularEstado();
  let preferencias = { ...PREFERENCIAS_POR_DEFECTO };
  if (avisosMovil.estado === 'activado') {
    try {
      preferencias = { ...preferencias, ...(await estado.almacen.leerPreferencias() || {}) };
    } catch {}
  }
  const pintar = capa => {
    const e = avisosMovil.estado;
    const modal = capa.querySelector('.modal');
    if (e !== 'activado' && e !== 'desactivado') {
      modal.innerHTML = `<h2>Avisos en el móvil</h2>${textoEstadoAvisos(e)}<div class="acciones-modal"><button class="boton primario" data-cerrar>Entendido</button></div>`;
      modal.querySelector('[data-cerrar]').onclick = cerrarModal;
      return;
    }
    if (e === 'desactivado') {
      modal.innerHTML = `
        <h2>Avisos en el móvil</h2>
        <p>Te mandamos una notificación aunque tengas la app cerrada:</p>
        <ul class="lista-ventajas">
          <li>1 hora antes de cada quedada, y 3 horas antes para confirmar que vas.</li>
          <li>Cuando alguien escribe en el chat de tus quedadas.</li>
          <li>Si entras desde la lista de espera.</li>
        </ul>
        <p class="error-form" id="error-avisos" role="alert" hidden></p>
        <div class="acciones-modal">
          <button class="boton secundario" data-cerrar>Ahora no</button>
          <button class="boton primario" data-activar>Activar avisos</button>
        </div>`;
      modal.querySelector('[data-cerrar]').onclick = cerrarModal;
      modal.querySelector('[data-activar]').onclick = async ev => {
        const boton = ev.currentTarget;
        boton.disabled = true;
        boton.textContent = 'Activando…';
        try {
          await avisosMovil.activar();
          avisar('Avisos activados en este dispositivo');
          pintar(capa);
        } catch (err) {
          const el = modal.querySelector('#error-avisos');
          el.textContent = traducirError(err);
          el.hidden = false;
          if (avisosMovil.estado !== 'desactivado') pintar(capa);
          else {
            boton.disabled = false;
            boton.textContent = 'Activar avisos';
          }
        }
      };
      return;
    }
    const p = preferencias;
    const chips = Object.entries(DEPORTES).map(([clave, d]) => `
      <button type="button" class="chip" data-deporte-aviso="${clave}" aria-pressed="${p.deportes.includes(clave)}" style="--c:${d.color}"><span aria-hidden="true">${d.icono}</span>${d.nombre}</button>`).join('');
    modal.innerHTML = `
      <h2>Avisos en el móvil</h2>
      <p class="confirmacion-hecha">✓ Activados en este dispositivo</p>
      <form id="form-avisos" class="form-avisos">
        <label class="interruptor"><input type="checkbox" name="recordatorios" ${p.recordatorios ? 'checked' : ''}><span>Recordatorios de mis quedadas</span></label>
        <label class="interruptor"><input type="checkbox" name="chat" ${p.chat ? 'checked' : ''}><span>Mensajes del chat</span></label>
        <label class="interruptor"><input type="checkbox" name="plazas" ${p.plazas ? 'checked' : ''}><span>Cambios en la lista de espera</span></label>
        <label class="interruptor"><input type="checkbox" name="nuevas" ${p.nuevas ? 'checked' : ''}><span>Quedadas nuevas cerca de mí</span></label>
        ${p.nuevas ? `
          <div class="caja-nuevas">
            <p class="nota">Elige deportes (si no eliges ninguno, te avisamos de todos):</p>
            <div class="chips envolver">${chips}</div>
            <label class="campo"><span>Distancia</span><select name="radio_km">${[2, 5, 10, 20].map(km => `<option value="${km}" ${km === p.radio_km ? 'selected' : ''}>A menos de ${km} km</option>`).join('')}</select></label>
            <p class="nota">${estado.origenEsUsuario ? 'Contamos la distancia desde tu ubicación actual.' : 'Contamos la distancia desde Puerta del Sol. Pulsa el botón de ubicación del mapa para usar la tuya.'}</p>
          </div>` : ''}
        <p class="error-form" id="error-avisos" role="alert" hidden></p>
        <div class="acciones-modal separadas">
          <button type="button" class="boton secundario" data-desactivar>Desactivar aquí</button>
          <button class="boton primario">Guardar</button>
        </div>
      </form>`;
    const form = modal.querySelector('form');
    const leer = () => {
      p.recordatorios = form.recordatorios.checked;
      p.chat = form.chat.checked;
      p.plazas = form.plazas.checked;
      p.nuevas = form.nuevas.checked;
      if (form.radio_km) p.radio_km = Number(form.radio_km.value);
    };
    form.nuevas.onchange = () => { leer(); pintar(capa); };
    modal.querySelectorAll('[data-deporte-aviso]').forEach(b => {
      b.onclick = () => {
        leer();
        const clave = b.dataset.deporteAviso;
        p.deportes = p.deportes.includes(clave) ? p.deportes.filter(x => x !== clave) : [...p.deportes, clave];
        b.setAttribute('aria-pressed', String(p.deportes.includes(clave)));
      };
    });
    modal.querySelector('[data-desactivar]').onclick = async () => {
      await avisosMovil.desactivar();
      avisar('Avisos desactivados en este dispositivo');
      pintar(capa);
    };
    form.onsubmit = async ev => {
      ev.preventDefault();
      leer();
      try {
        await estado.almacen.guardarPreferencias({
          recordatorios: p.recordatorios,
          chat: p.chat,
          plazas: p.plazas,
          nuevas: p.nuevas,
          deportes: p.deportes,
          radio_km: p.radio_km,
          lat: estado.origen.lat,
          lng: estado.origen.lng
        });
        cerrarModal();
        avisar('Avisos guardados');
      } catch (err) {
        const el = modal.querySelector('#error-avisos');
        el.textContent = traducirError(err);
        el.hidden = false;
      }
    };
  };
  abrirModal('', capa => pintar(capa));
}

async function invitarAAvisos() {
  try {
    if (leerLocal('quedadas.invitacion-avisos', false)) return;
    await avisosMovil.calcularEstado();
    if (!['desactivado', 'ios-instalar'].includes(avisosMovil.estado)) return;
    guardarLocal('quedadas.invitacion-avisos', true);
    setTimeout(() => { if ($('#modal').hidden) abrirAvisos(); }, 700);
  } catch {}
}

function abrirPerfil() {
  if (!estado.almacen?.requiereCuenta) return pedirNombre();
  if (estado.usuario) return abrirPerfilNube();
  return abrirAcceso();
}

async function asegurarUsuario(motivo) {
  if (estado.usuario) return estado.usuario;
  if (estado.almacen?.requiereCuenta) return await abrirAcceso(motivo);
  return await pedirNombre(motivo);
}

function confirmar(titulo, texto, textoBoton) {
  return new Promise(resolver => {
    let respuesta = false;
    abrirModal(`
      <h2>${esc(titulo)}</h2>
      <p>${esc(texto)}</p>
      <div class="acciones-modal">
        <button class="boton secundario" data-no>Volver</button>
        <button class="boton peligro" data-si>${esc(textoBoton)}</button>
      </div>`, capa => {
      capa.onCerrar = () => resolver(respuesta);
      capa.querySelector('[data-no]').onclick = cerrarModal;
      capa.querySelector('[data-si]').onclick = () => { respuesta = true; cerrarModal(); };
    });
  });
}

function esFinde(fecha) {
  const hoy = inicioDia(new Date());
  const diaSemana = hoy.getDay();
  const sabado = new Date(hoy);
  sabado.setDate(hoy.getDate() + (diaSemana === 0 ? -1 : 6 - diaSemana));
  const lunes = new Date(sabado);
  lunes.setDate(sabado.getDate() + 2);
  return fecha >= sabado && fecha < lunes;
}

function puntuacionCasi(a) {
  const p = plazas(a);
  return p.completa ? 999 : p.libres;
}

function ordenador(orden) {
  const criterios = {
    cercania: (x, y) => x.km - y.km,
    pronto: (x, y) => new Date(x.a.inicio) - new Date(y.a.inicio),
    popular: (x, y) => y.a.apuntados.length - x.a.apuntados.length,
    casi: (x, y) => puntuacionCasi(x.a) - puntuacionCasi(y.a) || new Date(x.a.inicio) - new Date(y.a.inicio)
  };
  return criterios[orden] || criterios.cercania;
}

function cumpleFiltros(a) {
  const f = estado.filtros;
  if (haTerminado(a)) return false;
  if (f.deportes.size && !f.deportes.has(a.deporte)) return false;
  if (f.texto) {
    const buscado = normalizar(f.texto);
    const contenido = normalizar(`${a.titulo} ${a.lugar.nombre} ${DEPORTES[a.deporte]?.nombre} ${a.descripcion} ${a.organizador.nombre}`);
    if (!contenido.includes(buscado)) return false;
  }
  const inicio = new Date(a.inicio);
  const dias = diasHasta(inicio);
  if (f.cuando === 'hoy' && dias !== 0) return false;
  if (f.cuando === 'manana' && dias !== 1) return false;
  if (f.cuando === 'finde' && !esFinde(inicio)) return false;
  if (f.cuando === 'semana' && dias > 6) return false;
  if (f.nivel !== 'cualquiera' && a.nivel !== 'todos' && a.nivel !== f.nivel) return false;
  if (f.conPlazas && plazas(a).completa) return false;
  if (f.gratis && a.precio > 0) return false;
  if (f.zona && estado.limitesMapa && !estado.limitesMapa.contains([a.lugar.lat, a.lugar.lng])) return false;
  return true;
}

function actividadesVisibles() {
  return estado.actividades
    .filter(cumpleFiltros)
    .map(a => ({ a, km: distanciaKm(estado.origen, a.lugar) }))
    .sort(ordenador(estado.filtros.orden));
}

function urgentes() {
  const ahora = Date.now();
  return estado.actividades
    .filter(a => {
      const inicio = new Date(a.inicio).getTime();
      const p = plazas(a);
      return inicio > ahora && inicio - ahora < 86400000 && !p.completa && (p.faltan > 0 || p.libres <= 2);
    })
    .sort((x, y) => plazas(x).faltan - plazas(y).faltan || new Date(x.inicio) - new Date(y.inicio))
    .slice(0, 8);
}

function misPlanes() {
  return estado.actividades
    .filter(a => !haTerminado(a) && (estaApuntado(a) || estaEnEspera(a) || esOrganizador(a)))
    .sort((x, y) => new Date(x.inicio) - new Date(y.inicio));
}

function hayFiltrosActivos() {
  const f = estado.filtros;
  return !!(f.texto || f.deportes.size || f.cuando !== 'todo' || f.nivel !== 'cualquiera' || f.conPlazas || f.gratis || f.zona);
}

function guardarFiltros() {
  const f = estado.filtros;
  guardarLocal(CLAVE_FILTROS, { ...f, deportes: [...f.deportes], texto: '' });
}

function cargarFiltros() {
  const guardados = leerLocal(CLAVE_FILTROS, null);
  if (!guardados) return;
  Object.assign(estado.filtros, guardados, { deportes: new Set(guardados.deportes || []), texto: '' });
}

function puedeVerChat(a) {
  return estaApuntado(a) || estaEnEspera(a) || esOrganizador(a);
}

function miInscripcion(a) {
  if (!estado.usuario) return null;
  return a.apuntados.find(p => p.id === estado.usuario.id) || null;
}

function pendienteConfirmar(a) {
  if (!estado.almacen?.asistencia || esOrganizador(a)) return false;
  const yo = miInscripcion(a);
  const falta = new Date(a.inicio) - Date.now();
  return !!yo && !yo.confirmada && falta > 0 && falta <= 3 * 3600000;
}

function leerLeidos() {
  return leerLocal(CLAVE_LEIDOS, {});
}

function marcarLeido(a) {
  const ultimo = a.mensajes[a.mensajes.length - 1];
  if (!ultimo) return;
  const leidos = leerLeidos();
  if (leidos[a.id] === ultimo.fecha) return;
  leidos[a.id] = ultimo.fecha;
  guardarLocal(CLAVE_LEIDOS, leidos);
}

function noLeidos(a) {
  if (!estado.usuario || !puedeVerChat(a)) return 0;
  const desde = leerLeidos()[a.id];
  return a.mensajes.filter(m => m.tipo === 'texto' && m.autor?.id !== estado.usuario.id && (!desde || new Date(m.fecha) > new Date(desde))).length;
}

function htmlEstadoPlazas(a) {
  const p = plazas(a);
  if (p.completa) return `<span class="estado completa">Completa</span>`;
  if (p.faltan > 0) return `<span class="estado faltan">Faltan ${p.faltan}</span>`;
  return `<span class="estado libres">${p.libres} ${p.libres === 1 ? 'plaza' : 'plazas'}</span>`;
}

function htmlDorsales(a, tamano = '') {
  const p = plazas(a);
  if (a.max > 24) {
    return `<span class="barra-plazas ${tamano}" role="img" aria-label="${p.n} de ${a.max} plazas ocupadas"><span style="width:${Math.min(100, p.n / a.max * 100)}%"></span></span>`;
  }
  let html = '';
  for (let i = 0; i < a.max; i++) {
    const persona = a.apuntados[i];
    const clases = ['dorsal'];
    if (persona) clases.push('lleno');
    if (persona && persona.id === estado.usuario?.id) clases.push('yo');
    if (i === a.min - 1 && a.min < a.max) clases.push('umbral');
    html += `<i class="${clases.join(' ')}"></i>`;
  }
  return `<span class="dorsales ${tamano}" role="img" aria-label="${p.n} de ${a.max} plazas ocupadas, mínimo ${a.min}">${html}</span>`;
}

function htmlFila(a, km) {
  const d = DEPORTES[a.deporte] || DEPORTES.futbol;
  const inicio = new Date(a.inicio);
  const p = plazas(a);
  const mio = estaApuntado(a) || esOrganizador(a);
  return `
    <li>
      <button class="fila ${estado.seleccion === a.id ? 'seleccionada' : ''}" data-abrir="${a.id}" style="--c:${d.color}">
        <span class="icono-deporte" aria-hidden="true">${d.icono}</span>
        <span class="fila-cuerpo">
          <span class="fila-titulo">${esc(a.titulo)}</span>
          <span class="fila-lugar">${esc(a.lugar.nombre)}</span>
          <span class="fila-meta">
            ${km != null ? `<span>${formatoKm(km)}</span>` : ''}
            ${a.ruta?.length > 1 ? `<span>Ruta de ${formatoKm(longitudRuta(a.ruta))}</span>` : ''}
            <span>${esc(NIVELES[a.nivel] || '')}</span>
            ${mio ? `<span class="marca-mia">${esOrganizador(a) ? 'Organizas tú' : 'Vas'}</span>` : ''}
            ${estaEnEspera(a) ? `<span class="marca-mia">En espera</span>` : ''}
            ${pendienteConfirmar(a) ? `<span class="marca-pendiente">Confirma si vas</span>` : ''}
            ${noLeidos(a) ? `<span class="marca-mensajes">${noLeidos(a)} ${noLeidos(a) === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}</span>` : ''}
          </span>
          <span class="fila-plazas">${htmlDorsales(a, 'pequenos')}<span class="cuenta">${p.n}/${a.max}</span></span>
        </span>
        <span class="fila-hora">
          <span class="dia">${etiquetaDia(inicio)}</span>
          <span class="hora">${formatoHora(inicio)}</span>
          ${htmlEstadoPlazas(a)}
        </span>
      </button>
    </li>`;
}

function htmlExplorar() {
  const f = estado.filtros;
  const opciones = (lista, actual) => Object.entries(lista).map(([valor, texto]) => `<option value="${valor}" ${valor === actual ? 'selected' : ''}>${texto}</option>`).join('');
  const chips = Object.entries(DEPORTES).map(([clave, d]) => `
    <button class="chip" data-deporte="${clave}" aria-pressed="${f.deportes.has(clave)}" style="--c:${d.color}"><span aria-hidden="true">${d.icono}</span>${d.nombre}</button>`).join('');
  return `
    <div class="filtros">
      <label class="buscador">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
        <input type="search" id="buscar" placeholder="Busca deporte, sitio o persona" value="${esc(f.texto)}" aria-label="Buscar quedadas">
      </label>
      <div class="chips" role="group" aria-label="Filtrar por deporte">${chips}</div>
      <div class="fila-selects">
        <label class="selector"><span>Cuándo</span><select id="f-cuando">${opciones({ todo: 'Cualquier día', hoy: 'Hoy', manana: 'Mañana', finde: 'Este finde', semana: 'Próximos 7 días' }, f.cuando)}</select></label>
        <label class="selector"><span>Nivel</span><select id="f-nivel">${opciones({ cualquiera: 'Cualquiera', principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado' }, f.nivel)}</select></label>
        <label class="selector"><span>Ordenar</span><select id="f-orden">${opciones({ cercania: 'Más cerca', pronto: 'Más pronto', popular: 'Más gente', casi: 'Casi completas' }, f.orden)}</select></label>
      </div>
      <div class="interruptores">
        <label class="interruptor"><input type="checkbox" id="f-plazas" ${f.conPlazas ? 'checked' : ''}><span>Con plazas</span></label>
        <label class="interruptor"><input type="checkbox" id="f-gratis" ${f.gratis ? 'checked' : ''}><span>Gratis</span></label>
        <label class="interruptor"><input type="checkbox" id="f-zona" ${f.zona ? 'checked' : ''}><span>Solo zona del mapa</span></label>
      </div>
    </div>
    <div id="resultados"></div>`;
}

function htmlUrgentes() {
  const lista = urgentes();
  if (!lista.length || hayFiltrosActivos()) return '';
  return `
    <section class="urgentes" aria-labelledby="titulo-urgentes">
      <h2 id="titulo-urgentes">Les falta gente</h2>
      <p class="subtitulo">Empiezan en menos de 24 horas</p>
      <ul class="carril">
        ${lista.map(a => {
          const d = DEPORTES[a.deporte];
          const p = plazas(a);
          const inicio = new Date(a.inicio);
          return `
            <li>
              <button class="tarjeta-urgente" data-abrir="${a.id}" style="--c:${d.color}">
                <span class="numero">${p.faltan > 0 ? p.faltan : p.libres}</span>
                <span class="texto-numero">${p.faltan > 0 ? (p.faltan === 1 ? 'falta para jugar' : 'faltan para jugar') : (p.libres === 1 ? 'plaza libre' : 'plazas libres')}</span>
                <span class="que"><span aria-hidden="true">${d.icono}</span> ${esc(a.titulo)}</span>
                <span class="cuando">${etiquetaDia(inicio)}, ${formatoHora(inicio)}</span>
              </button>
            </li>`;
        }).join('')}
      </ul>
    </section>`;
}

function pintarResultados() {
  const contenedor = $('#resultados');
  if (!contenedor) return;
  if (estado.cargando) {
    contenedor.innerHTML = '<p class="cargando">Cargando quedadas…</p>';
    return;
  }
  const lista = actividadesVisibles();
  const desde = estado.origenEsUsuario ? 'desde tu ubicación' : 'desde Puerta del Sol';
  let cuerpo;
  if (!lista.length) {
    cuerpo = `
      <div class="vacio">
        <p class="vacio-titulo">No hay quedadas con estos filtros</p>
        <p>Prueba con otro día o deporte, o crea tú la quedada y deja que la gente se apunte.</p>
        <div class="acciones-vacio">
          ${hayFiltrosActivos() ? '<button class="boton secundario" data-accion="limpiar-filtros">Quitar filtros</button>' : ''}
          <button class="boton primario" data-accion="crear">Crear quedada</button>
        </div>
      </div>`;
  } else {
    cuerpo = `<ul class="lista">${lista.map(x => htmlFila(x.a, x.km)).join('')}</ul>`;
  }
  contenedor.innerHTML = `
    ${htmlUrgentes()}
    <div class="cabecera-lista">
      <h2>${lista.length} ${lista.length === 1 ? 'quedada' : 'quedadas'}</h2>
      <span class="desde">Distancias ${desde}</span>
      ${hayFiltrosActivos() ? '<button class="enlace" data-accion="limpiar-filtros">Quitar filtros</button>' : ''}
    </div>
    ${cuerpo}`;
  pintarMarcadores();
}

function htmlPersona(p, extra = '', mostrarConfirmada = false) {
  const marca = mostrarConfirmada && p.confirmada ? '<span class="confirmada" title="Ha confirmado que va" aria-label="Confirmado">✓</span>' : '';
  return `<li class="persona"><span class="avatar" style="--c:${colorPersona(p.id)}">${esc(iniciales(p.nombre))}</span><span>${esc(p.nombre)}${p.id === estado.usuario?.id ? ' (tú)' : ''}</span>${marca}${extra}</li>`;
}

function horaMensaje(fechaIso) {
  const fecha = new Date(fechaIso);
  const hora = formatoHora(fecha);
  const dias = diasHasta(fecha);
  if (dias === 0) return hora;
  if (dias === -1) return `Ayer, ${hora}`;
  return `${fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}, ${hora}`;
}

function htmlMensajes(a) {
  if (!a.mensajes.length) {
    return '<li class="chat-vacio">Aún no hay mensajes. Saluda al grupo o pregunta lo que necesites: quién lleva el balón, dónde aparcar…</li>';
  }
  let anterior = null;
  return a.mensajes.map(m => {
    if (m.tipo === 'sistema') {
      anterior = null;
      return `<li class="mensaje sistema"><span>${esc(m.texto)}</span></li>`;
    }
    const mio = m.autor?.id === estado.usuario?.id;
    const seguido = anterior === m.autor?.id;
    anterior = m.autor?.id;
    return `
      <li class="mensaje ${mio ? 'mio' : 'otro'} ${seguido ? 'seguido' : ''}">
        ${!mio ? `<span class="avatar" style="--c:${colorPersona(m.autor?.id)}" aria-hidden="true">${seguido ? '' : esc(iniciales(m.autor?.nombre))}</span>` : ''}
        <div class="burbuja">
          ${!mio && !seguido ? `<p class="autor" style="--c:${colorPersona(m.autor?.id)}">${esc(m.autor?.nombre)}</p>` : ''}
          <p class="texto">${esc(m.texto)}</p>
          <time datetime="${esc(m.fecha)}">${horaMensaje(m.fecha)}</time>
        </div>
      </li>`;
  }).join('');
}

function htmlChat(a, organiza) {
  if (!puedeVerChat(a)) {
    return `
      <section class="seccion-detalle chat-cerrado">
        <h2>Chat del grupo</h2>
        <p>Cuando te apuntes podrás hablar con el resto: avisar si llegas tarde, quién lleva el balón o dónde aparcar. Solo lo ven las personas apuntadas.</p>
      </section>`;
  }
  const aviso = a.aviso
    ? `<div class="aviso-fijado"><span class="icono-aviso" aria-hidden="true">📌</span><p>${esc(a.aviso)}</p>${organiza ? '<button class="enlace" data-accion="editar-aviso">Cambiar</button>' : ''}</div>`
    : (organiza ? '<button class="boton terciario fijar-aviso" data-accion="editar-aviso">📌 Fijar un aviso para el grupo</button>' : '');
  return `
    <section class="seccion-detalle chat" id="chat">
      <div class="chat-cabecera">
        <h2>Chat del grupo</h2>
        <span class="nota">Solo lo ven las personas apuntadas</span>
      </div>
      ${aviso}
      <ol class="mensajes" id="lista-mensajes" aria-live="polite">${htmlMensajes(a)}</ol>
      <p class="escribiendo" id="escribiendo" hidden></p>
      <form class="form-chat" id="form-chat">
        <label class="oculto" for="texto-chat">Escribe un mensaje</label>
        <textarea id="texto-chat" rows="1" maxlength="500" placeholder="Escribe al grupo" enterkeyhint="send"></textarea>
        <button class="boton primario boton-enviar" aria-label="Enviar">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5L4 12z" fill="currentColor"/></svg>
        </button>
      </form>
    </section>`;
}

function htmlConfirmacion(a) {
  if (!pendienteConfirmar(a)) {
    const yo = miInscripcion(a);
    const falta = new Date(a.inicio) - Date.now();
    if (estado.almacen?.asistencia && yo?.confirmada && !esOrganizador(a) && falta > 0 && falta <= 3 * 3600000) {
      return '<p class="confirmacion-hecha">✓ Has confirmado que vas. ¡Nos vemos allí!</p>';
    }
    return '';
  }
  const hayEspera = a.espera.length > 0;
  return `
    <div class="confirmacion" role="region" aria-label="Confirmar asistencia">
      <p class="confirmacion-titulo">¿Sigues yendo?</p>
      <p>${hayEspera ? `Hay ${a.espera.length} ${a.espera.length === 1 ? 'persona' : 'personas'} en lista de espera. Si no confirmas, una hora antes tu plaza pasará a la primera.` : 'Confirma para que el grupo sepa con quién puede contar.'}</p>
      <div class="confirmacion-botones">
        <button class="boton primario" data-accion="confirmar-si">Sí, voy</button>
        <button class="boton secundario" data-accion="salir">No puedo ir</button>
      </div>
    </div>`;
}

function htmlDetalle(a) {
  if (!a) {
    return `
      <div class="detalle">
        <button class="volver" data-accion="volver">Volver</button>
        <div class="vacio"><p class="vacio-titulo">Esta quedada ya no existe</p><p>Puede que quien la organizaba la haya cancelado.</p></div>
      </div>`;
  }
  const d = DEPORTES[a.deporte] || DEPORTES.futbol;
  const inicio = new Date(a.inicio);
  const fin = new Date(inicio.getTime() + a.duracionMin * 60000);
  const p = plazas(a);
  const km = distanciaKm(estado.origen, a.lugar);
  const apuntado = estaApuntado(a);
  const enEspera = estaEnEspera(a);
  const organiza = esOrganizador(a);
  const atras = cuentaAtras(inicio);
  let estadoTexto;
  if (p.completa) estadoTexto = `Completa. ${a.espera.length ? `${a.espera.length} en lista de espera.` : 'Si te apuntas, entras en la lista de espera.'}`;
  else if (p.faltan > 0) estadoTexto = `Faltan ${p.faltan} ${p.faltan === 1 ? 'persona' : 'personas'} para que se confirme (mínimo ${a.min}).`;
  else estadoTexto = `Confirmada. Quedan ${p.libres} ${p.libres === 1 ? 'plaza libre' : 'plazas libres'}.`;

  let botonPrincipal;
  if (organiza) botonPrincipal = `<button class="boton primario grande" disabled>Organizas tú esta quedada</button>`;
  else if (apuntado && pendienteConfirmar(a)) botonPrincipal = '';
  else if (apuntado) botonPrincipal = `<button class="boton secundario grande" data-accion="salir">Ya no puedo ir</button>`;
  else if (enEspera) botonPrincipal = `<button class="boton secundario grande" data-accion="salir">Salir de la lista de espera</button>`;
  else if (p.completa) botonPrincipal = `<button class="boton primario grande" data-accion="apuntarse">Apuntarme a la lista de espera</button>`;
  else botonPrincipal = `<button class="boton primario grande" data-accion="apuntarse">Apuntarme</button>`;

  return `
    <article class="detalle" style="--c:${d.color}">
      <button class="volver" data-accion="volver">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Volver
      </button>
      <p class="etiqueta-deporte"><span aria-hidden="true">${d.icono}</span> ${d.nombre}</p>
      <h1 class="titulo-detalle">${esc(a.titulo)}</h1>
      <div class="bloque-hora">
        <div>
          <span class="dia">${etiquetaDia(inicio)}</span>
          <span class="hora-grande">${formatoHora(inicio)}</span>
        </div>
        <div class="hora-extra">
          <span>Hasta las ${formatoHora(fin)}</span>
          <span>${formatoDuracion(a.duracionMin)}</span>
          ${atras ? `<span class="cuenta-atras">${atras}</span>` : ''}
        </div>
      </div>

      <section class="plazas-detalle" aria-label="Plazas">
        <div class="plazas-cabecera">
          <span class="plazas-numero">${p.n}<small>/${a.max}</small></span>
          ${htmlEstadoPlazas(a)}
        </div>
        ${htmlDorsales(a, 'grandes')}
        <p class="plazas-texto">${estadoTexto}</p>
        ${htmlConfirmacion(a)}
        <div class="acciones-detalle">
          ${botonPrincipal}
        </div>
        <div class="acciones-secundarias">
          <button class="boton terciario" data-accion="compartir">Copiar enlace</button>
          <button class="boton terciario" data-accion="calendario">Añadir al calendario</button>
          <a class="boton terciario" href="https://www.google.com/maps/dir/?api=1&destination=${a.lugar.lat},${a.lugar.lng}" target="_blank" rel="noopener">Cómo llegar</a>
        </div>
      </section>

      <dl class="datos">
        <div><dt>Punto de encuentro</dt><dd>${esc(a.lugar.nombre)}<span class="secundario">${formatoKm(km)} ${estado.origenEsUsuario ? 'de ti' : 'de Sol'}</span></dd></div>
        ${a.ruta?.length > 1 ? `<div><dt>Ruta</dt><dd>${formatoKm(longitudRuta(a.ruta))}<span class="secundario">Dibujada en el mapa</span></dd></div>` : ''}
        ${a.ritmo ? `<div><dt>Ritmo</dt><dd>${esc(a.ritmo)}</dd></div>` : ''}
        <div><dt>Nivel</dt><dd>${esc(NIVELES[a.nivel] || a.nivel)}</dd></div>
        <div><dt>Precio</dt><dd>${formatoPrecio(a.precio)}</dd></div>
        <div><dt>Organiza</dt><dd>${esc(a.organizador.nombre)}${organiza ? ' (tú)' : ''}</dd></div>
      </dl>

      ${a.descripcion ? `<p class="descripcion">${esc(a.descripcion)}</p>` : ''}

      <section class="seccion-detalle">
        <h2>Quién va</h2>
        <ul class="personas">${a.apuntados.map(x => htmlPersona(x, x.id === a.organizador.id ? '<span class="rol">Organiza</span>' : '', estado.almacen?.asistencia && new Date(a.inicio) - Date.now() <= 3 * 3600000)).join('')}</ul>
        ${a.espera.length ? `<h3>Lista de espera</h3><ol class="personas espera">${a.espera.map(x => htmlPersona(x)).join('')}</ol>` : ''}
      </section>

      ${htmlChat(a, organiza)}

      ${organiza ? `<button class="boton peligro ancho" data-accion="cancelar">Cancelar quedada</button>` : ''}
    </article>`;
}

function htmlBannerAvisos() {
  if (!estado.usuario || !avisosMovil.configurado() || !['desactivado', 'ios-instalar'].includes(avisosMovil.estado)) return '';
  return `
    <button class="banner-avisos" data-accion="abrir-avisos">
      <span aria-hidden="true">🔔</span>
      <span><strong>Activa los avisos</strong> y te recordamos tus planes, te avisamos si alguien escribe o si entras desde la lista de espera.</span>
    </button>`;
}

function htmlPlanes() {
  const lista = misPlanes();
  if (!estado.usuario || !lista.length) {
    return `
      <div class="vacio planes-vacio">
        <p class="vacio-titulo">Todavía no tienes planes</p>
        <p>Cuando te apuntes a una quedada o crees una, aparecerá aquí ordenada por fecha.</p>
        <div class="acciones-vacio">
          <button class="boton secundario" data-pestana="explorar">Buscar quedadas</button>
          <button class="boton primario" data-accion="crear">Crear quedada</button>
        </div>
      </div>`;
  }
  const grupos = new Map();
  for (const a of lista) {
    const clave = etiquetaDia(new Date(a.inicio));
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(a);
  }
  return htmlBannerAvisos() + [...grupos].map(([dia, acts]) => `
    <section class="grupo-dia">
      <h2>${dia}</h2>
      <ul class="lista">${acts.map(a => htmlFila(a, distanciaKm(estado.origen, a.lugar))).join('')}</ul>
    </section>`).join('');
}

function borradorNuevo(deporte = 'futbol') {
  const d = DEPORTES[deporte];
  const inicio = new Date(Date.now() + 2 * 3600000);
  inicio.setMinutes(0, 0, 0);
  const pad = n => String(n).padStart(2, '0');
  return {
    deporte,
    titulo: '',
    descripcion: '',
    fecha: `${inicio.getFullYear()}-${pad(inicio.getMonth() + 1)}-${pad(inicio.getDate())}`,
    hora: `${pad(inicio.getHours())}:00`,
    duracionMin: d.duracion,
    lugar: null,
    ruta: [],
    ritmo: '',
    nivel: 'todos',
    min: d.plazas[0],
    max: d.plazas[1],
    precio: 0
  };
}

function htmlCrear() {
  const b = estado.borrador;
  const d = DEPORTES[b.deporte];
  const opcionesDuracion = [30, 45, 60, 75, 90, 120, 150, 180, 240, 300].map(m => `<option value="${m}" ${m === b.duracionMin ? 'selected' : ''}>${formatoDuracion(m)}</option>`).join('');
  const chips = Object.entries(DEPORTES).map(([clave, x]) => `
    <button type="button" class="chip" data-crear-deporte="${clave}" aria-pressed="${clave === b.deporte}" style="--c:${x.color}"><span aria-hidden="true">${x.icono}</span>${x.nombre}</button>`).join('');
  return `
    <form class="crear" id="form-crear" novalidate>
      <button type="button" class="volver" data-accion="volver">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Volver
      </button>
      <h1 class="titulo-crear">Crear quedada</h1>

      <fieldset>
        <legend>Qué vais a hacer</legend>
        <div class="chips envolver" role="group" aria-label="Deporte">${chips}</div>
        <label class="campo"><span>Título</span><input data-campo="titulo" maxlength="70" value="${esc(b.titulo)}" placeholder="${esc(`${d.nombre} con gente nueva`)}"></label>
        <label class="campo"><span>Detalles <small>opcional</small></span><textarea data-campo="descripcion" rows="3" maxlength="500" placeholder="Qué hay que llevar, si hay pista reservada, cómo os reconoceréis">${esc(b.descripcion)}</textarea></label>
      </fieldset>

      <fieldset>
        <legend>Cuándo</legend>
        <div class="dos-columnas">
          <label class="campo"><span>Día</span><input type="date" data-campo="fecha" value="${b.fecha}" required></label>
          <label class="campo"><span>Hora</span><input type="time" data-campo="hora" value="${b.hora}" required step="300"></label>
        </div>
        <label class="campo"><span>Duración</span><select data-campo="duracionMin">${opcionesDuracion}</select></label>
      </fieldset>

      <fieldset>
        <legend>Dónde</legend>
        <div class="estado-lugar ${b.lugar ? 'listo' : ''}" id="estado-lugar">${htmlEstadoLugar()}</div>
        <label class="campo"><span>Nombre del sitio</span><input data-campo="lugarNombre" maxlength="80" value="${esc(b.lugar?.nombre || '')}" placeholder="Por ejemplo: entrada principal del Retiro"></label>
        ${d.ruta ? `
          <div class="caja-ruta">
            <div class="caja-ruta-cabecera">
              <span>Ruta <small>opcional</small></span>
              <span class="km-ruta" id="km-ruta">${b.ruta.length > 1 ? formatoKm(longitudRuta(b.ruta)) : 'Sin dibujar'}</span>
            </div>
            <p class="nota">Toca el mapa punto a punto para trazar el recorrido. Empieza en el punto de encuentro.</p>
            <div class="botones-ruta">
              <button type="button" class="boton secundario" data-accion="dibujar-ruta">${b.ruta.length ? 'Seguir dibujando' : 'Dibujar ruta'}</button>
              <button type="button" class="boton terciario" data-accion="deshacer-punto" ${b.ruta.length ? '' : 'disabled'}>Deshacer punto</button>
              <button type="button" class="boton terciario" data-accion="borrar-ruta" ${b.ruta.length ? '' : 'disabled'}>Borrar ruta</button>
            </div>
            <label class="campo"><span>Ritmo <small>opcional</small></span><input data-campo="ritmo" maxlength="40" value="${esc(b.ritmo)}" placeholder="${b.deporte === 'ciclismo' ? '18 km/h' : '6:00 min/km'}"></label>
          </div>` : ''}
      </fieldset>

      <fieldset>
        <legend>Quién puede venir</legend>
        <label class="campo"><span>Nivel</span><select data-campo="nivel">${Object.entries(NIVELES).map(([v, t]) => `<option value="${v}" ${v === b.nivel ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <div class="dos-columnas">
          <label class="campo"><span>Mínimo para hacerla</span><input type="number" data-campo="min" min="1" max="100" value="${b.min}"></label>
          <label class="campo"><span>Máximo de plazas</span><input type="number" data-campo="max" min="2" max="100" value="${b.max}"></label>
        </div>
        <label class="campo"><span>Precio por persona en euros</span><input type="number" data-campo="precio" min="0" max="500" step="0.5" value="${b.precio}"><small class="ayuda">Pon 0 si es gratis. Útil para pagar la pista a medias.</small></label>
      </fieldset>

      <p class="error-form" id="error-form" role="alert" hidden></p>
      <button class="boton primario grande ancho">Publicar quedada</button>
    </form>`;
}

function htmlEstadoLugar() {
  const b = estado.borrador;
  if (b.lugar) {
    return `<span>Punto de encuentro marcado en el mapa. Puedes arrastrarlo para ajustarlo.</span><button type="button" class="enlace" data-accion="marcar-punto">Cambiar</button>`;
  }
  return `<span>${MOVIL.matches ? 'Marca en el mapa dónde quedáis.' : 'Toca el mapa para marcar dónde quedáis.'}</span><button type="button" class="boton secundario" data-accion="marcar-punto">Marcar en el mapa</button>`;
}

function pintarUsuario() {
  const boton = $('#boton-usuario');
  if (estado.usuario) {
    boton.innerHTML = `<span class="avatar" style="--c:${colorPersona(estado.usuario.id)}">${esc(iniciales(estado.usuario.nombre))}</span><span class="nombre-usuario">${esc(estado.usuario.nombre)}</span>`;
  } else {
    boton.innerHTML = `<span class="nombre-usuario">${estado.almacen?.requiereCuenta ? 'Entrar' : 'Poner mi nombre'}</span>`;
  }
  const planes = misPlanes();
  const n = planes.length;
  const contador = $('#contador-planes');
  contador.hidden = !n;
  contador.textContent = n;
  const atencion = planes.some(a => pendienteConfirmar(a) || noLeidos(a));
  contador.classList.toggle('atencion', atencion);
  contador.title = atencion ? 'Tienes mensajes nuevos o algo que confirmar' : '';
}

function pintarPestanas() {
  document.querySelectorAll('[role="tab"]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.pestana === estado.pestana)));
}

function pintarVista(forzar = false) {
  const vista = $('#vista');
  const clave = `${estado.pestana}:${estado.vista}`;
  if (estado.vista === 'lista' && estado.pestana === 'explorar') {
    if (forzar || vista.dataset.clave !== clave) {
      vista.innerHTML = htmlExplorar();
      vista.dataset.clave = clave;
    }
    pintarResultados();
  } else {
    vista.dataset.clave = clave;
    if (estado.vista === 'detalle') {
      const a = estado.actividades.find(x => x.id === estado.seleccion);
      const campo = $('#texto-chat');
      const borrador = campo?.value || '';
      const tenia = document.activeElement === campo;
      const seleccion = tenia ? [campo.selectionStart, campo.selectionEnd] : null;
      vista.innerHTML = htmlDetalle(a);
      const nuevo = $('#texto-chat');
      if (nuevo && borrador) {
        nuevo.value = borrador;
        ajustarAlturaChat(nuevo);
      }
      if (nuevo && tenia) {
        nuevo.focus({ preventScroll: true });
        if (seleccion) nuevo.setSelectionRange(seleccion[0], seleccion[1]);
      }
      despuesDePintarDetalle(a);
    } else {
      estado.almacen?.cerrarCanalChat?.();
      vista.innerHTML = estado.vista === 'crear' ? htmlCrear() : htmlPlanes();
    }
    pintarMarcadores();
  }
  if (estado.vista !== 'detalle') estado.almacen?.cerrarCanalChat?.();
  document.body.dataset.vista = estado.vista;
  pintarPestanas();
  pintarUsuario();
  pintarAvisoMapa();
  $('#boton-crear').hidden = estado.vista === 'crear';
}

function irALista() {
  estado.vista = 'lista';
  estado.seleccion = null;
  estado.modoMapa = null;
  estado.borrador = null;
  capaBorrador?.clearLayers();
  pintarVista();
  requestAnimationFrame(() => { $('#vista').scrollTop = estado.scrollLista; });
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

function abrirDetalle(id, { mover = true } = {}) {
  if (estado.vista === 'lista') estado.scrollLista = $('#vista').scrollTop;
  estado.seleccion = id;
  estado.vista = 'detalle';
  estado.modoMapa = null;
  ocultarPrevia();
  pintarVista();
  $('#vista').scrollTop = 0;
  if (MOVIL.matches) cambiarModoMovil('lista');
  if (mover) enfocarActividad(id);
  history.replaceState(null, '', `#a-${id}`);
}

function seleccionarDesdeMapa(id) {
  if (MOVIL.matches) {
    estado.seleccion = id;
    pintarMarcadores();
    mostrarPrevia(id);
  } else {
    abrirDetalle(id, { mover: false });
    enfocarActividad(id, true);
  }
}

function mostrarPrevia(id) {
  const a = estado.actividades.find(x => x.id === id);
  if (!a) return;
  const caja = $('#vista-previa');
  caja.innerHTML = `
    <ul class="lista">${htmlFila(a, distanciaKm(estado.origen, a.lugar))}</ul>
    <button class="cerrar-previa" data-accion="cerrar-previa" aria-label="Cerrar">×</button>`;
  caja.hidden = false;
}

function ocultarPrevia() {
  const caja = $('#vista-previa');
  caja.hidden = true;
  caja.innerHTML = '';
}

function cambiarModoMovil(modo) {
  estado.modoMovil = modo;
  document.body.classList.toggle('ver-mapa', modo === 'mapa');
  document.querySelectorAll('[data-modo]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.modo === modo)));
  if (modo === 'mapa') setTimeout(() => mapa.invalidateSize(), 50);
  else ocultarPrevia();
}

let mapa;
let capaMarcadores;
let capaRuta;
let capaBorrador;
let marcadorYo;

function iniciarMapa() {
  mapa = L.map('mapa', { zoomControl: false, attributionControl: true }).setView([estado.origen.lat, estado.origen.lng], 13);
  L.control.zoom({ position: 'topright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(mapa);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(mapa);
  capaRuta = L.layerGroup().addTo(mapa);
  capaMarcadores = L.layerGroup().addTo(mapa);
  capaBorrador = L.layerGroup().addTo(mapa);
  estado.limitesMapa = mapa.getBounds();
  mapa.on('click', alPulsarMapa);
  mapa.on('moveend', () => {
    estado.limitesMapa = mapa.getBounds();
    if (estado.filtros.zona && estado.vista === 'lista' && estado.pestana === 'explorar') pintarResultados();
  });
}

function iconoPin(a, activo) {
  const d = DEPORTES[a.deporte] || DEPORTES.futbol;
  const p = plazas(a);
  return L.divIcon({
    className: 'pin-envoltorio',
    html: `<div class="pin ${activo ? 'activo' : ''} ${p.completa ? 'llena' : ''}" style="--c:${d.color}"><span>${d.icono}</span>${p.faltan > 0 && !p.completa ? `<b>${p.faltan}</b>` : ''}</div>`,
    iconSize: [44, 52],
    iconAnchor: [22, 50]
  });
}

function pintarMarcadores() {
  if (!mapa) return;
  capaMarcadores.clearLayers();
  let lista = [];
  if (estado.vista !== 'crear') {
    lista = estado.pestana === 'planes' && estado.vista !== 'detalle' ? misPlanes() : actividadesVisibles().map(x => x.a);
    const elegida = estado.actividades.find(a => a.id === estado.seleccion);
    if (elegida && !lista.includes(elegida)) lista.push(elegida);
  }
  for (const a of lista) {
    const activo = a.id === estado.seleccion;
    L.marker([a.lugar.lat, a.lugar.lng], { icon: iconoPin(a, activo), title: a.titulo, alt: a.titulo, riseOnHover: true, zIndexOffset: activo ? 1000 : 0 })
      .on('click', () => seleccionarDesdeMapa(a.id))
      .addTo(capaMarcadores);
  }
  pintarRutaSeleccion();
}

function dibujarRuta(capa, ruta, color, conVertices = false) {
  if (!ruta || ruta.length < 2) return null;
  L.polyline(ruta, { color: '#ffffff', weight: 9, opacity: 0.9, interactive: false }).addTo(capa);
  const linea = L.polyline(ruta, { color, weight: 5, opacity: 1, lineJoin: 'round', interactive: false }).addTo(capa);
  if (conVertices) {
    ruta.forEach(punto => L.circleMarker(punto, { radius: 4, color, weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(capa));
  }
  const final = ruta[ruta.length - 1];
  L.circleMarker(final, { radius: 7, color: '#14213D', weight: 3, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(capa).bindTooltip('Final', { permanent: false });
  return linea;
}

function pintarRutaSeleccion() {
  capaRuta.clearLayers();
  const a = estado.actividades.find(x => x.id === estado.seleccion);
  if (a?.ruta?.length > 1 && estado.vista !== 'crear') dibujarRuta(capaRuta, a.ruta, DEPORTES[a.deporte].color);
}

function enfocarActividad(id, suave = false) {
  const a = estado.actividades.find(x => x.id === id);
  if (!a || !mapa) return;
  if (a.ruta?.length > 1) {
    mapa.flyToBounds(L.latLngBounds(a.ruta).extend([a.lugar.lat, a.lugar.lng]), { padding: [60, 60], maxZoom: 16, duration: 0.8 });
  } else if (!suave || !mapa.getBounds().pad(-0.15).contains([a.lugar.lat, a.lugar.lng])) {
    mapa.flyTo([a.lugar.lat, a.lugar.lng], Math.max(mapa.getZoom(), 15), { duration: 0.8 });
  }
}

function pintarBorrador() {
  capaBorrador.clearLayers();
  const b = estado.borrador;
  if (!b) return;
  const d = DEPORTES[b.deporte];
  if (b.ruta.length > 1) dibujarRuta(capaBorrador, b.ruta, d.color, true);
  else if (b.ruta.length === 1) L.circleMarker(b.ruta[0], { radius: 5, color: d.color, weight: 3, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(capaBorrador);
  if (b.lugar) {
    const pin = L.marker([b.lugar.lat, b.lugar.lng], {
      draggable: true,
      icon: L.divIcon({ className: 'pin-envoltorio', html: `<div class="pin activo borrador" style="--c:${d.color}"><span>${d.icono}</span></div>`, iconSize: [44, 52], iconAnchor: [22, 50] })
    }).addTo(capaBorrador);
    pin.on('dragend', () => {
      const { lat, lng } = pin.getLatLng();
      b.lugar.lat = lat;
      b.lugar.lng = lng;
      if (b.ruta.length) b.ruta[0] = [lat, lng];
      pintarBorrador();
      actualizarRutaFormulario();
    });
  }
  const km = $('#km-ruta');
  if (km) km.textContent = b.ruta.length > 1 ? formatoKm(longitudRuta(b.ruta)) : 'Sin dibujar';
}

function actualizarRutaFormulario() {
  const b = estado.borrador;
  if (!b) return;
  const km = $('#km-ruta');
  if (km) km.textContent = b.ruta.length > 1 ? formatoKm(longitudRuta(b.ruta)) : 'Sin dibujar';
  document.querySelectorAll('[data-accion="deshacer-punto"], [data-accion="borrar-ruta"]').forEach(x => { x.disabled = !b.ruta.length; });
  const dibujar = $('[data-accion="dibujar-ruta"]');
  if (dibujar) dibujar.textContent = b.ruta.length ? 'Seguir dibujando' : 'Dibujar ruta';
  const estadoLugar = $('#estado-lugar');
  if (estadoLugar) {
    estadoLugar.innerHTML = htmlEstadoLugar();
    estadoLugar.classList.toggle('listo', !!b.lugar);
  }
  pintarAvisoMapa();
}

function pintarAvisoMapa() {
  const aviso = $('#aviso-mapa');
  const b = estado.borrador;
  if (estado.vista !== 'crear' || !estado.modoMapa || !b) {
    aviso.hidden = true;
    aviso.innerHTML = '';
    return;
  }
  const volver = MOVIL.matches ? '<button class="boton primario" data-accion="terminar-mapa">Listo</button>' : '';
  if (estado.modoMapa === 'punto') {
    aviso.innerHTML = `<span>${b.lugar ? 'Toca otra vez para mover el punto de encuentro' : 'Toca el mapa donde quedáis'}</span>${b.lugar ? volver : ''}`;
  } else {
    const km = b.ruta.length > 1 ? formatoKm(longitudRuta(b.ruta)) : 'Toca para añadir puntos';
    aviso.innerHTML = `<span><strong>Dibujando ruta</strong> ${km}</span><button class="boton terciario" data-accion="deshacer-punto" ${b.ruta.length ? '' : 'disabled'}>Deshacer</button><button class="boton primario" data-accion="terminar-mapa">Terminar</button>`;
  }
  aviso.hidden = false;
}

function alPulsarMapa(e) {
  if (estado.vista === 'crear' && estado.borrador) {
    const b = estado.borrador;
    const { lat, lng } = e.latlng;
    if (estado.modoMapa === 'ruta') {
      if (!b.ruta.length && b.lugar) b.ruta.push([b.lugar.lat, b.lugar.lng]);
      b.ruta.push([lat, lng]);
      if (!b.lugar) b.lugar = { lat, lng, nombre: $('[data-campo="lugarNombre"]')?.value || '' };
    } else {
      b.lugar = { lat, lng, nombre: b.lugar?.nombre || $('[data-campo="lugarNombre"]')?.value || '' };
      if (b.ruta.length) b.ruta[0] = [lat, lng];
      if (!MOVIL.matches) $('[data-campo="lugarNombre"]')?.focus({ preventScroll: true });
    }
    pintarBorrador();
    actualizarRutaFormulario();
    return;
  }
  if (MOVIL.matches) ocultarPrevia();
}

function centrarEnUsuario(silencioso = false) {
  if (!navigator.geolocation) {
    if (!silencioso) avisar('Tu navegador no permite obtener la ubicación.', 'error');
    return;
  }
  navigator.geolocation.getCurrentPosition(pos => {
    estado.origen = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    estado.origenEsUsuario = true;
    if (marcadorYo) marcadorYo.remove();
    marcadorYo = L.marker([estado.origen.lat, estado.origen.lng], {
      icon: L.divIcon({ className: 'pin-envoltorio', html: '<div class="yo-punto"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
      interactive: false,
      keyboard: false
    }).addTo(mapa);
    mapa.flyTo([estado.origen.lat, estado.origen.lng], 14, { duration: 0.8 });
    if (estado.vista === 'lista') pintarResultados();
    if (!silencioso) avisar('Distancias calculadas desde tu ubicación');
  }, () => {
    if (!silencioso) avisar('No se ha podido obtener tu ubicación. Revisa el permiso de ubicación del navegador.', 'error');
  }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
}

async function intentarUbicacionAutomatica() {
  try {
    const permiso = await navigator.permissions?.query({ name: 'geolocation' });
    if (permiso?.state === 'granted') centrarEnUsuario(true);
  } catch {}
}

async function empezarCrear() {
  const usuario = await asegurarUsuario('Para crear una quedada necesitamos saber quién organiza.');
  if (!usuario) return;
  estado.seleccion = null;
  estado.borrador = borradorNuevo(estado.filtros.deportes.size === 1 ? [...estado.filtros.deportes][0] : 'futbol');
  estado.vista = 'crear';
  estado.modoMapa = MOVIL.matches ? null : 'punto';
  ocultarPrevia();
  if (MOVIL.matches) cambiarModoMovil('lista');
  pintarVista();
  pintarBorrador();
  $('#vista').scrollTop = 0;
}

function errorFormulario(texto) {
  const el = $('#error-form');
  el.textContent = texto;
  el.hidden = false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function publicar() {
  const b = estado.borrador;
  const d = DEPORTES[b.deporte];
  const nombreLugar = ($('[data-campo="lugarNombre"]')?.value || '').trim();
  if (!b.lugar) return errorFormulario('Falta el punto de encuentro: márcalo en el mapa.');
  if (!nombreLugar) return errorFormulario('Escribe el nombre del sitio para que la gente sepa dónde es.');
  const inicio = new Date(`${b.fecha}T${b.hora}`);
  if (isNaN(inicio)) return errorFormulario('Revisa el día y la hora.');
  if (inicio < new Date()) return errorFormulario('La fecha y la hora tienen que ser futuras.');
  const min = Math.round(Number(b.min));
  const max = Math.round(Number(b.max));
  if (!(max >= 2 && max <= 100)) return errorFormulario('El máximo de plazas tiene que estar entre 2 y 100.');
  if (!(min >= 1 && min <= max)) return errorFormulario('El mínimo tiene que ser al menos 1 y no puede superar el máximo.');
  const precio = Math.max(0, Number(b.precio) || 0);
  const datos = {
    deporte: b.deporte,
    titulo: b.titulo.trim() || `${d.nombre} en ${nombreLugar}`,
    descripcion: b.descripcion.trim(),
    inicio: inicio.toISOString(),
    duracionMin: Number(b.duracionMin),
    lugar: { nombre: nombreLugar, lat: b.lugar.lat, lng: b.lugar.lng },
    ruta: d.ruta && b.ruta.length > 1 ? b.ruta : null,
    ritmo: d.ruta ? b.ritmo.trim() : '',
    nivel: b.nivel,
    min,
    max,
    precio,
    organizador: estado.usuario
  };
  try {
    const nueva = await estado.almacen.crear(datos);
    await refrescar();
    estado.borrador = null;
    capaBorrador.clearLayers();
    avisar('Quedada publicada');
    abrirDetalle(nueva.id);
  } catch (error) {
    errorFormulario(error.message);
  }
}

async function accionSobreSeleccion(tipo) {
  const id = estado.seleccion;
  const a = estado.actividades.find(x => x.id === id);
  if (!a) return;
  try {
    if (tipo === 'apuntarse') {
      const usuario = await asegurarUsuario('Para apuntarte, dinos cómo te llamas.');
      if (!usuario) return;
      const completa = plazas(a).completa;
      await estado.almacen.apuntarse(id, usuario);
      avisar(completa ? 'Te has apuntado a la lista de espera' : '¡Apuntado! Nos vemos allí');
      invitarAAvisos();
    } else if (tipo === 'salir') {
      await estado.almacen.salir(id, estado.usuario);
      avisar('Te has borrado de la quedada');
    } else if (tipo === 'cancelar') {
      const ok = await confirmar('¿Cancelar esta quedada?', `Se borrará para las ${a.apuntados.length} personas apuntadas. No se puede deshacer.`, 'Cancelar quedada');
      if (!ok) return;
      await estado.almacen.cancelar(id, estado.usuario);
      await refrescar();
      avisar('Quedada cancelada');
      irALista();
      return;
    }
    await refrescar();
    pintarVista();
  } catch (error) {
    avisar(error.message, 'error');
    await refrescar();
    pintarVista();
  }
}

let enviandoMensaje = false;

async function enviarMensaje() {
  const campo = $('#texto-chat');
  const texto = campo?.value.trim();
  if (!texto || enviandoMensaje) return;
  const usuario = await asegurarUsuario('Para escribir en el grupo, entra con tu cuenta.');
  if (!usuario) return;
  enviandoMensaje = true;
  campo.value = '';
  ajustarAlturaChat(campo);
  try {
    await estado.almacen.escribir(estado.seleccion, usuario, texto);
    await refrescar();
    pintarVista();
    $('#texto-chat')?.focus({ preventScroll: true });
  } catch (error) {
    const actual = $('#texto-chat');
    if (actual && !actual.value) actual.value = texto;
    avisar(error.message, 'error');
  } finally {
    enviandoMensaje = false;
  }
}

function ajustarAlturaChat(campo) {
  if (!campo) return;
  campo.style.height = 'auto';
  campo.style.height = `${Math.min(campo.scrollHeight, 140)}px`;
}

let temporizadorEscribiendo = null;

function mostrarEscribiendo(nombre) {
  const el = $('#escribiendo');
  if (!el) return;
  el.textContent = `${nombre} está escribiendo…`;
  el.hidden = false;
  clearTimeout(temporizadorEscribiendo);
  temporizadorEscribiendo = setTimeout(() => { el.hidden = true; }, 3500);
}

function despuesDePintarDetalle(a) {
  const lista = $('#lista-mensajes');
  if (!a || !lista) {
    estado.almacen?.cerrarCanalChat?.();
    return;
  }
  lista.scrollTop = lista.scrollHeight;
  marcarLeido(a);
  estado.almacen?.abrirCanalChat?.(a.id, mostrarEscribiendo);
}

function editarAviso() {
  const a = estado.actividades.find(x => x.id === estado.seleccion);
  if (!a) return;
  abrirModal(`
    <h2>Aviso para el grupo</h2>
    <p>Aparece fijado arriba del chat. Sirve para lo importante: pista, puerta de entrada, qué llevar.</p>
    <form id="form-aviso">
      <label class="campo"><span>Aviso</span><textarea name="aviso" rows="3" maxlength="200" placeholder="Pista 3, entrada por la puerta norte">${esc(a.aviso)}</textarea></label>
      <p class="error-form" id="error-aviso" role="alert" hidden></p>
      <div class="acciones-modal ${a.aviso ? 'separadas' : ''}">
        ${a.aviso ? '<button type="button" class="boton secundario" data-quitar>Quitar aviso</button>' : '<button type="button" class="boton secundario" data-cerrar>Cancelar</button>'}
        <button class="boton primario">Fijar aviso</button>
      </div>
    </form>`, capa => {
    const guardar = async texto => {
      try {
        await estado.almacen.fijarAviso(a.id, estado.usuario, texto);
        cerrarModal();
        await refrescar();
        pintarVista();
        avisar(texto ? 'Aviso fijado' : 'Aviso quitado');
      } catch (error) {
        const el = capa.querySelector('#error-aviso');
        el.textContent = traducirError(error);
        el.hidden = false;
      }
    };
    capa.querySelector('[data-cerrar]')?.addEventListener('click', cerrarModal);
    capa.querySelector('[data-quitar]')?.addEventListener('click', () => guardar(''));
    capa.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const texto = e.target.aviso.value.trim();
      if (texto) guardar(texto);
    };
  });
}

async function confirmarAsistencia() {
  try {
    await estado.almacen.confirmar(estado.seleccion, estado.usuario);
    await refrescar();
    pintarVista();
    avisar('¡Confirmado! El grupo ya sabe que vas');
  } catch (error) {
    avisar(error.message, 'error');
  }
}

async function copiarEnlace() {
  const enlace = `${location.href.split('#')[0]}#a-${estado.seleccion}`;
  try {
    await navigator.clipboard.writeText(enlace);
    avisar('Enlace copiado. Pégalo en tu grupo para invitar a gente.');
  } catch {
    abrirModal(`<h2>Enlace de la quedada</h2><p>Cópialo y compártelo:</p><input class="enlace-copiar" readonly value="${esc(enlace)}"><div class="acciones-modal"><button class="boton primario" data-cerrar>Hecho</button></div>`, capa => {
      capa.querySelector('[data-cerrar]').onclick = cerrarModal;
      capa.querySelector('input').select();
    });
  }
}

function escaparIcs(texto) {
  return String(texto || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);
}

function descargarCalendario() {
  const a = estado.actividades.find(x => x.id === estado.seleccion);
  if (!a) return;
  const formato = fecha => fecha.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const inicio = new Date(a.inicio);
  const fin = new Date(inicio.getTime() + a.duracionMin * 60000);
  const lineas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Quedadas//ES', 'BEGIN:VEVENT',
    `UID:${a.id}@quedadas`, `DTSTAMP:${formato(new Date())}`, `DTSTART:${formato(inicio)}`, `DTEND:${formato(fin)}`,
    `SUMMARY:${escaparIcs(a.titulo)}`, `LOCATION:${escaparIcs(a.lugar.nombre)}`, `GEO:${a.lugar.lat};${a.lugar.lng}`,
    `DESCRIPTION:${escaparIcs(a.descripcion)}`, 'END:VEVENT', 'END:VCALENDAR'
  ];
  const url = URL.createObjectURL(new Blob([lineas.join('\r\n')], { type: 'text/calendar' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `${normalizar(a.titulo).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'quedada'}.ics`;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  avisar('Archivo de calendario descargado');
}

function limpiarFiltros() {
  estado.filtros = { ...estado.filtros, texto: '', deportes: new Set(), cuando: 'todo', nivel: 'cualquiera', conPlazas: false, gratis: false, zona: false };
  guardarFiltros();
  pintarVista(true);
}

document.addEventListener('click', async e => {
  const objetivo = e.target.closest('[data-accion], [data-abrir], [data-deporte], [data-pestana], [data-modo], [data-crear-deporte]');
  if (!objetivo || objetivo.disabled) return;
  if (objetivo.tagName === 'A' && !objetivo.dataset.accion) return;

  if (objetivo.dataset.abrir) {
    abrirDetalle(objetivo.dataset.abrir);
    return;
  }
  if (objetivo.dataset.deporte) {
    const clave = objetivo.dataset.deporte;
    const f = estado.filtros.deportes;
    f.has(clave) ? f.delete(clave) : f.add(clave);
    objetivo.setAttribute('aria-pressed', String(f.has(clave)));
    guardarFiltros();
    pintarResultados();
    return;
  }
  if (objetivo.dataset.pestana) {
    estado.pestana = objetivo.dataset.pestana;
    estado.vista = 'lista';
    estado.seleccion = null;
    estado.borrador = null;
    estado.modoMapa = null;
    capaBorrador?.clearLayers();
    pintarVista(true);
    $('#vista').scrollTop = 0;
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    return;
  }
  if (objetivo.dataset.modo) {
    cambiarModoMovil(objetivo.dataset.modo);
    return;
  }
  if (objetivo.dataset.crearDeporte) {
    const b = estado.borrador;
    const anterior = DEPORTES[b.deporte];
    const nuevo = DEPORTES[objetivo.dataset.crearDeporte];
    if (b.min === anterior.plazas[0] && b.max === anterior.plazas[1]) { b.min = nuevo.plazas[0]; b.max = nuevo.plazas[1]; }
    if (b.duracionMin === anterior.duracion) b.duracionMin = nuevo.duracion;
    b.deporte = objetivo.dataset.crearDeporte;
    if (!nuevo.ruta) { b.ruta = []; if (estado.modoMapa === 'ruta') estado.modoMapa = null; }
    const scroll = $('#vista').scrollTop;
    pintarVista();
    pintarBorrador();
    $('#vista').scrollTop = scroll;
    return;
  }

  switch (objetivo.dataset.accion) {
    case 'inicio':
      e.preventDefault();
      estado.pestana = 'explorar';
      irALista();
      break;
    case 'perfil':
      abrirPerfil();
      break;
    case 'crear':
      empezarCrear();
      break;
    case 'ubicarme':
      centrarEnUsuario();
      break;
    case 'volver':
      irALista();
      break;
    case 'apuntarse':
    case 'salir':
    case 'cancelar':
      accionSobreSeleccion(objetivo.dataset.accion);
      break;
    case 'compartir':
      copiarEnlace();
      break;
    case 'confirmar-si':
      confirmarAsistencia();
      break;
    case 'abrir-avisos':
      abrirAvisos();
      break;
    case 'editar-aviso':
      editarAviso();
      break;
    case 'calendario':
      descargarCalendario();
      break;
    case 'limpiar-filtros':
      limpiarFiltros();
      break;
    case 'cerrar-previa':
      ocultarPrevia();
      estado.seleccion = null;
      pintarMarcadores();
      break;
    case 'marcar-punto':
      estado.modoMapa = 'punto';
      if (MOVIL.matches) cambiarModoMovil('mapa');
      pintarAvisoMapa();
      break;
    case 'dibujar-ruta':
      estado.modoMapa = 'ruta';
      if (MOVIL.matches) cambiarModoMovil('mapa');
      if (estado.borrador.lugar && !estado.borrador.ruta.length) mapa.flyTo([estado.borrador.lugar.lat, estado.borrador.lugar.lng], Math.max(mapa.getZoom(), 15));
      pintarAvisoMapa();
      break;
    case 'deshacer-punto':
      estado.borrador.ruta.pop();
      if (estado.borrador.ruta.length === 1) estado.borrador.ruta = [];
      pintarBorrador();
      actualizarRutaFormulario();
      break;
    case 'borrar-ruta':
      estado.borrador.ruta = [];
      pintarBorrador();
      actualizarRutaFormulario();
      break;
    case 'terminar-mapa':
      estado.modoMapa = null;
      if (MOVIL.matches) cambiarModoMovil('lista');
      pintarAvisoMapa();
      break;
  }
});

document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'texto-chat') {
    ajustarAlturaChat(el);
    estado.almacen?.avisarEscribiendo?.();
    return;
  }
  if (el.id === 'buscar') {
    estado.filtros.texto = el.value;
    pintarResultados();
    return;
  }
  const campo = el.dataset.campo;
  if (campo && estado.borrador) {
    const b = estado.borrador;
    if (campo === 'lugarNombre') {
      if (b.lugar) b.lugar.nombre = el.value;
      else b.lugarNombrePendiente = el.value;
    } else if (['min', 'max', 'precio', 'duracionMin'].includes(campo)) {
      b[campo] = el.value === '' ? '' : Number(el.value);
    } else {
      b[campo] = el.value;
    }
    $('#error-form')?.setAttribute('hidden', '');
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  const mapaFiltros = { 'f-cuando': 'cuando', 'f-nivel': 'nivel', 'f-orden': 'orden', 'f-plazas': 'conPlazas', 'f-gratis': 'gratis', 'f-zona': 'zona' };
  const clave = mapaFiltros[el.id];
  if (!clave) return;
  estado.filtros[clave] = el.type === 'checkbox' ? el.checked : el.value;
  guardarFiltros();
  pintarResultados();
});

document.addEventListener('submit', e => {
  if (e.target.id === 'form-crear') {
    e.preventDefault();
    publicar();
  } else if (e.target.id === 'form-chat') {
    e.preventDefault();
    enviarMensaje();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!$('#modal').hidden) cerrarModal();
    else if (estado.modoMapa) { estado.modoMapa = null; pintarAvisoMapa(); }
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.target.id === 'texto-chat' && !MOVIL.matches) {
    e.preventDefault();
    enviarMensaje();
  }
});

$('#modal').addEventListener('click', e => {
  if (e.target.id === 'modal') cerrarModal();
});

function abrirDesdeHash() {
  const coincide = location.hash.match(/^#a-([\w-]+)$/);
  if (coincide && estado.actividades.some(a => a.id === coincide[1])) abrirDetalle(coincide[1]);
}

window.addEventListener('hashchange', abrirDesdeHash);
MOVIL.addEventListener?.('change', () => { cambiarModoMovil('lista'); setTimeout(() => mapa.invalidateSize(), 100); pintarAvisoMapa(); });

async function sondear() {
  if (document.hidden) return;
  const antes = JSON.stringify(estado.actividades);
  await refrescar();
  if (JSON.stringify(estado.actividades) === antes) return;
  if (estado.vista === 'crear' || !$('#modal').hidden) return;
  const scroll = $('#vista').scrollTop;
  pintarVista();
  $('#vista').scrollTop = scroll;
}

async function arrancar() {
  estado.usuario = leerLocal(CLAVE_USUARIO, null);
  cargarFiltros();
  iniciarMapa();
  estado.almacen = await elegirAlmacen();
  estado.cargando = true;
  pintarVista(true);
  try {
    await estado.almacen.iniciar();
  } catch (error) {
    avisar(traducirError(error), 'error');
  }
  pintarUsuario();
  await refrescar();
  estado.cargando = false;
  await avisosMovil.sincronizar();
  pintarVista(true);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', ev => {
      if (ev.data?.tipo !== 'abrir') return;
      const destino = new URL(ev.data.url, location.href);
      if (destino.hash && destino.hash !== location.hash) location.hash = destino.hash;
      else abrirDesdeHash();
    });
  }
  abrirDesdeHash();
  intentarUbicacionAutomatica();
  setInterval(sondear, estado.almacen.modo === 'nube' ? 30000 : estado.almacen.modo === 'local' ? 60000 : 8000);
  setInterval(() => { if (estado.vista === 'lista') pintarResultados(); }, 60000);
}

arrancar();
