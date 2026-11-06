import json
import os
import re
import socket
import sys
import threading
import uuid
from datetime import datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

CARPETA = Path(__file__).resolve().parent
ARCHIVO_DATOS = CARPETA / "datos.json"
ARCHIVO_EJEMPLOS = CARPETA / "datos-ejemplo.js"
CERROJO = threading.Lock()
NIVELES = {"todos", "principiante", "intermedio", "avanzado"}
PRIVADOS = {"/datos.json", "/servidor.py"}


def ahora():
    return datetime.now().astimezone()


def leer_fecha(texto):
    return datetime.fromisoformat(str(texto).replace("Z", "+00:00"))


def fecha_ejemplo(e):
    d = ahora()
    if e.get("enHoras") is not None:
        d = d + timedelta(hours=e["enHoras"])
        minutos = -(-d.minute // 15) * 15
        d = d.replace(minute=0, second=0, microsecond=0) + timedelta(minutes=minutos)
        if d.hour < 8:
            d = d.replace(hour=8 + int(e["enHoras"]), minute=0)
    else:
        h, m = (int(x) for x in e["hora"].split(":"))
        d = (d + timedelta(days=e["diasDesdeHoy"])).replace(hour=h, minute=m, second=0, microsecond=0)
    return d


def construir_ejemplos():
    texto = ARCHIVO_EJEMPLOS.read_text(encoding="utf-8")
    ejemplos = json.loads(texto[texto.index("["):texto.rindex("]") + 1])
    resultado = []
    for e in ejemplos:
        a = {k: v for k, v in e.items() if k not in ("diasDesdeHoy", "hora", "enHoras")}
        a["inicio"] = fecha_ejemplo(e).isoformat()
        a["creada"] = ahora().isoformat()
        a["mensajes"] = [
            {**{k: v for k, v in m.items() if k != "haceMin"}, "fecha": (ahora() - timedelta(minutes=m["haceMin"])).isoformat()}
            for m in a.get("mensajes", [])
        ]
        resultado.append(normalizar(a))
    return resultado


def normalizar(a):
    if "mensajes" not in a:
        a["mensajes"] = [{**c, "tipo": "texto"} for c in a.get("comentarios", [])]
    a.pop("comentarios", None)
    a["aviso"] = a.get("aviso") or ""
    a["apuntados"] = [{**p, "confirmada": bool(p.get("confirmada")) or p["id"] == a["organizador"]["id"]} for p in a.get("apuntados", [])]
    a["espera"] = [{**p, "confirmada": bool(p.get("confirmada"))} for p in a.get("espera", [])]
    return a


def nuevo_id():
    return uuid.uuid4().hex[:12]


def mensaje_sistema(a, texto_mensaje):
    a["mensajes"].append({"id": nuevo_id(), "tipo": "sistema", "autor": None, "texto": texto_mensaje, "fecha": ahora().isoformat()})


def avisar_si_se_confirma(a):
    if a["min"] > 1 and len(a["apuntados"]) == a["min"]:
        mensaje_sistema(a, f"Ya sois {a['min']}: ¡quedada confirmada!")


def ha_terminado(a):
    return leer_fecha(a["inicio"]) + timedelta(minutes=a["duracionMin"]) < ahora()


def cargar():
    datos = []
    if ARCHIVO_DATOS.exists():
        try:
            datos = json.loads(ARCHIVO_DATOS.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            datos = []
    datos = [normalizar(a) for a in datos]
    vivos = [a for a in datos if a["id"].startswith("ej-") and not ha_terminado(a)]
    if len(vivos) < 4:
        datos = construir_ejemplos() + [a for a in datos if not a["id"].startswith("ej-")]
        guardar(datos)
    elif any([liberar(a) for a in datos]):
        guardar(datos)
    return datos


def guardar(datos):
    temporal = ARCHIVO_DATOS.with_suffix(".tmp")
    temporal.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
    temporal.replace(ARCHIVO_DATOS)


class ErrorPeticion(Exception):
    def __init__(self, mensaje, codigo=400):
        super().__init__(mensaje)
        self.codigo = codigo


def texto(valor, maximo, obligatorio=False, nombre="texto"):
    valor = str(valor or "").strip()[:maximo]
    if obligatorio and not valor:
        raise ErrorPeticion(f"Falta {nombre}.")
    return valor


def numero(valor, minimo, maximo, nombre, entero=True):
    try:
        n = int(valor) if entero else float(valor)
    except (TypeError, ValueError):
        raise ErrorPeticion(f"El campo {nombre} no es un número válido.")
    if not minimo <= n <= maximo:
        raise ErrorPeticion(f"El campo {nombre} tiene que estar entre {minimo} y {maximo}.")
    return n


def usuario_valido(u):
    if not isinstance(u, dict):
        raise ErrorPeticion("Falta saber quién eres. Pon tu nombre en la app.")
    return {"id": texto(u.get("id"), 40, True, "el identificador"), "nombre": texto(u.get("nombre"), 30, True, "tu nombre")}


def actividad_valida(d):
    lugar = d.get("lugar") or {}
    ruta = d.get("ruta")
    if ruta is not None:
        if not isinstance(ruta, list) or len(ruta) > 500:
            raise ErrorPeticion("La ruta no es válida.")
        ruta = [[numero(p[0], -90, 90, "latitud", False), numero(p[1], -180, 180, "longitud", False)] for p in ruta]
        if len(ruta) < 2:
            ruta = None
    deporte = texto(d.get("deporte"), 20, True, "el deporte")
    if not re.fullmatch(r"[a-z]+", deporte):
        raise ErrorPeticion("Deporte no válido.")
    nivel = d.get("nivel") if d.get("nivel") in NIVELES else "todos"
    try:
        inicio = leer_fecha(d.get("inicio"))
    except (TypeError, ValueError):
        raise ErrorPeticion("La fecha no es válida.")
    if inicio.tzinfo is None:
        inicio = inicio.astimezone()
    if inicio < ahora() - timedelta(minutes=5):
        raise ErrorPeticion("La fecha y la hora tienen que ser futuras.")
    minimo = numero(d.get("min"), 1, 100, "mínimo")
    maximo = numero(d.get("max"), 2, 100, "máximo")
    if minimo > maximo:
        raise ErrorPeticion("El mínimo no puede superar el máximo.")
    return {
        "deporte": deporte,
        "titulo": texto(d.get("titulo"), 70, True, "el título"),
        "descripcion": texto(d.get("descripcion"), 500),
        "inicio": inicio.isoformat(),
        "duracionMin": numero(d.get("duracionMin"), 15, 720, "duración"),
        "lugar": {
            "nombre": texto(lugar.get("nombre"), 80, True, "el nombre del sitio"),
            "lat": numero(lugar.get("lat"), -90, 90, "latitud", False),
            "lng": numero(lugar.get("lng"), -180, 180, "longitud", False),
        },
        "ruta": ruta,
        "ritmo": texto(d.get("ritmo"), 40),
        "nivel": nivel,
        "min": minimo,
        "max": maximo,
        "precio": round(numero(d.get("precio", 0), 0, 500, "precio", False), 2),
    }


def apuntar(a, u):
    if any(p["id"] == u["id"] for p in a["apuntados"] + a["espera"]):
        return
    persona = {**u, "confirmada": leer_fecha(a["inicio"]) - ahora() < timedelta(hours=3)}
    if len(a["apuntados"]) < a["max"]:
        a["apuntados"].append(persona)
        mensaje_sistema(a, f"{u['nombre']} se ha apuntado")
        avisar_si_se_confirma(a)
    else:
        a["espera"].append(persona)
        mensaje_sistema(a, f"{u['nombre']} está en la lista de espera")


def desapuntar(a, u):
    if a["organizador"]["id"] == u["id"]:
        raise ErrorPeticion("Quien organiza no puede borrarse. Si no vas a poder ir, cancela la quedada.")
    estaba_dentro = any(p["id"] == u["id"] for p in a["apuntados"])
    estaba_en_espera = any(p["id"] == u["id"] for p in a["espera"])
    a["apuntados"] = [p for p in a["apuntados"] if p["id"] != u["id"]]
    a["espera"] = [p for p in a["espera"] if p["id"] != u["id"]]
    if estaba_dentro:
        mensaje_sistema(a, f"{u['nombre']} ya no puede ir")
    elif estaba_en_espera:
        mensaje_sistema(a, f"{u['nombre']} ha salido de la lista de espera")
    while len(a["apuntados"]) < a["max"] and a["espera"]:
        siguiente = a["espera"].pop(0)
        a["apuntados"].append(siguiente)
        mensaje_sistema(a, f"{siguiente['nombre']} entra desde la lista de espera")
        avisar_si_se_confirma(a)


def confirmar(a, u):
    persona = next((p for p in a["apuntados"] + a["espera"] if p["id"] == u["id"]), None)
    if not persona:
        raise ErrorPeticion("No estás apuntado a esta quedada.")
    persona["confirmada"] = True


def fijar_aviso(a, u, aviso):
    if a["organizador"]["id"] != u["id"]:
        raise ErrorPeticion("Solo quien organiza puede fijar avisos.", 403)
    a["aviso"] = texto(aviso, 200)
    if a["aviso"]:
        mensaje_sistema(a, f"Aviso fijado: {a['aviso']}")


def liberar(a):
    falta = leer_fecha(a["inicio"]) - ahora()
    if falta <= timedelta(0) or falta > timedelta(hours=1) or not a["espera"]:
        return False
    sin_confirmar = [p for p in a["apuntados"] if not p.get("confirmada") and p["id"] != a["organizador"]["id"]][::-1]
    esperando = list(a["espera"])
    cambiado = False
    for persona in sin_confirmar:
        if not esperando:
            break
        siguiente = esperando.pop(0)
        a["apuntados"] = [p for p in a["apuntados"] if p["id"] != persona["id"]]
        a["espera"] = [p for p in a["espera"] if p["id"] != siguiente["id"]]
        a["espera"].append({**persona, "confirmada": False})
        a["apuntados"].append({**siguiente, "confirmada": True})
        mensaje_sistema(a, f"{persona['nombre']} pasa a la lista de espera por no confirmar")
        mensaje_sistema(a, f"{siguiente['nombre']} entra desde la lista de espera")
        cambiado = True
    return cambiado


class Manejador(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(CARPETA), **kwargs)

    def log_message(self, formato, *args):
        if self.path.startswith("/api/") and self.command != "GET":
            sys.stderr.write(f"{self.log_date_time_string()}  {self.command} {self.path}\n")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def responder(self, codigo, cuerpo):
        datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def leer_cuerpo(self):
        largo = int(self.headers.get("Content-Length") or 0)
        if largo > 200_000:
            raise ErrorPeticion("La petición es demasiado grande.", 413)
        if not largo:
            return {}
        try:
            return json.loads(self.rfile.read(largo).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ErrorPeticion("La petición no es JSON válido.")

    def ejecutar(self, funcion):
        try:
            funcion()
        except ErrorPeticion as e:
            self.responder(e.codigo, {"error": str(e)})
        except Exception as e:
            sys.stderr.write(f"Error inesperado: {e!r}\n")
            self.responder(500, {"error": "Error inesperado en el servidor."})

    def do_GET(self):
        ruta = urlparse(self.path).path
        if ruta == "/api/salud":
            return self.responder(200, {"ok": True})
        if ruta == "/api/actividades":
            with CERROJO:
                datos = cargar()
            return self.responder(200, datos)
        if ruta in PRIVADOS or ruta.endswith(".tmp"):
            return self.responder(404, {"error": "No encontrado"})
        return super().do_GET()

    def do_POST(self):
        self.ejecutar(self.post)

    def do_DELETE(self):
        self.ejecutar(self.delete)

    def post(self):
        ruta = urlparse(self.path).path
        cuerpo = self.leer_cuerpo()
        if ruta == "/api/actividades":
            nueva = actividad_valida(cuerpo)
            organizador = usuario_valido(cuerpo.get("organizador"))
            nueva.update({
                "id": uuid.uuid4().hex[:12],
                "creada": ahora().isoformat(),
                "organizador": organizador,
                "aviso": "",
                "apuntados": [{**organizador, "confirmada": True}],
                "espera": [],
                "mensajes": [],
            })
            with CERROJO:
                datos = cargar()
                datos.append(nueva)
                guardar(datos)
            return self.responder(201, nueva)
        coincide = re.fullmatch(r"/api/actividades/([\w-]+)/(apuntarse|salir|mensajes|comentarios|confirmar|aviso)", ruta)
        if not coincide:
            raise ErrorPeticion("Ruta no encontrada.", 404)
        id_actividad, accion = coincide.groups()
        usuario = usuario_valido(cuerpo.get("usuario"))
        with CERROJO:
            datos = cargar()
            a = next((x for x in datos if x["id"] == id_actividad), None)
            if not a:
                raise ErrorPeticion("Esa quedada ya no existe.", 404)
            if accion == "apuntarse":
                apuntar(a, usuario)
            elif accion == "salir":
                desapuntar(a, usuario)
            elif accion == "confirmar":
                confirmar(a, usuario)
            elif accion == "aviso":
                fijar_aviso(a, usuario, cuerpo.get("aviso"))
            else:
                a["mensajes"].append({
                    "id": nuevo_id(),
                    "tipo": "texto",
                    "autor": usuario,
                    "texto": texto(cuerpo.get("texto"), 500, True, "el mensaje"),
                    "fecha": ahora().isoformat(),
                })
            guardar(datos)
        self.responder(200, a)

    def delete(self):
        coincide = re.fullmatch(r"/api/actividades/([\w-]+)", urlparse(self.path).path)
        if not coincide:
            raise ErrorPeticion("Ruta no encontrada.", 404)
        usuario = usuario_valido(self.leer_cuerpo().get("usuario"))
        with CERROJO:
            datos = cargar()
            a = next((x for x in datos if x["id"] == coincide.group(1)), None)
            if not a:
                raise ErrorPeticion("Esa quedada ya no existe.", 404)
            if a["organizador"]["id"] != usuario["id"]:
                raise ErrorPeticion("Solo quien la organiza puede cancelarla.", 403)
            guardar([x for x in datos if x["id"] != a["id"]])
        self.responder(200, {"ok": True})


def ip_local():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return None


def main():
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PUERTO", 8000))
    with CERROJO:
        cargar()
    servidor = ThreadingHTTPServer(("0.0.0.0", puerto), Manejador)
    print("\nQuedadas está en marcha.\n")
    print(f"  En este ordenador:        http://localhost:{puerto}")
    ip = ip_local()
    if ip:
        print(f"  Desde otro móvil o PC:    http://{ip}:{puerto}   (misma wifi)")
    print(f"\n  Los datos se guardan en:  {ARCHIVO_DATOS}")
    print("  Para pararlo pulsa Ctrl+C.\n")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor parado. ¡Hasta la próxima!")


if __name__ == "__main__":
    main()
