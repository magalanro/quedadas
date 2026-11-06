import webpush from "npm:web-push@3.6.7";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

type Aviso = { id: number; usuario_id: string; titulo: string; cuerpo: string; url: string; etiqueta: string | null };
type Suscripcion = { endpoint: string; usuario_id: string; p256dh: string; auth: string };
type Claves = { publica: string; privada: string };

const cabeceras = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

let clavesEnMemoria: Claves | null = null;

function responder(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: cabeceras });
}

async function obtenerClaves(supabase: SupabaseClient): Promise<Claves> {
  if (clavesEnMemoria) return clavesEnMemoria;
  const publicaEntorno = Deno.env.get("VAPID_PUBLIC_KEY");
  const privadaEntorno = Deno.env.get("VAPID_PRIVATE_KEY");
  if (publicaEntorno && privadaEntorno) {
    clavesEnMemoria = { publica: publicaEntorno, privada: privadaEntorno };
    return clavesEnMemoria;
  }
  const leer = async () => {
    const { data, error } = await supabase.from("claves_vapid").select("publica, privada").eq("id", 1).maybeSingle();
    if (error) throw new Error(`No se pueden leer las claves: ${error.message}. ¿Has ejecutado el script 5?`);
    return data as Claves | null;
  };
  let claves = await leer();
  if (!claves) {
    const nuevas = webpush.generateVAPIDKeys();
    const { error } = await supabase
      .from("claves_vapid")
      .upsert({ id: 1, publica: nuevas.publicKey, privada: nuevas.privateKey }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(`No se pueden guardar las claves: ${error.message}`);
    claves = await leer();
  }
  if (!claves) throw new Error("No se han podido crear las claves de los avisos.");
  clavesEnMemoria = claves;
  return claves;
}

Deno.serve(async (peticion) => {
  if (peticion.method === "OPTIONS") return new Response(null, { headers: cabeceras });

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const claveServicio = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const contacto = Deno.env.get("VAPID_SUBJECT") ?? "https://magalanro.github.io/quedadas/";
  if (!url || !claveServicio) return responder({ error: "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY." }, 500);

  const supabase = createClient(url, claveServicio, { auth: { persistSession: false, autoRefreshToken: false } });

  let claves: Claves;
  try {
    claves = await obtenerClaves(supabase);
  } catch (error) {
    return responder({ error: (error as Error).message }, 500);
  }

  if (new URL(peticion.url).searchParams.has("clave")) return responder({ publica: claves.publica });

  webpush.setVapidDetails(contacto, claves.publica, claves.privada);
  const resumen = { avisos: 0, enviados: 0, fallidos: 0, caducados: 0 };

  for (let ronda = 0; ronda < 5; ronda++) {
    const { data, error } = await supabase.rpc("reclamar_avisos", { p_limite: 200 });
    if (error) return responder({ error: error.message, ...resumen }, 500);
    const avisos = (data ?? []) as Aviso[];
    if (!avisos.length) break;
    resumen.avisos += avisos.length;

    const usuarios = [...new Set(avisos.map((a) => a.usuario_id))];
    const { data: filas, error: errorSuscripciones } = await supabase
      .from("suscripciones_push")
      .select("endpoint, usuario_id, p256dh, auth")
      .in("usuario_id", usuarios);
    if (errorSuscripciones) return responder({ error: errorSuscripciones.message, ...resumen }, 500);

    const porUsuario = new Map<string, Suscripcion[]>();
    for (const s of (filas ?? []) as Suscripcion[]) {
      if (!porUsuario.has(s.usuario_id)) porUsuario.set(s.usuario_id, []);
      porUsuario.get(s.usuario_id)!.push(s);
    }

    const caducadas = new Set<string>();
    const envios = avisos.flatMap((aviso) =>
      (porUsuario.get(aviso.usuario_id) ?? []).map(async (s) => {
        if (caducadas.has(s.endpoint)) return;
        const contenido = JSON.stringify({ titulo: aviso.titulo, cuerpo: aviso.cuerpo, url: aviso.url, etiqueta: aviso.etiqueta });
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            contenido,
            { TTL: 6 * 3600, urgency: "high" },
          );
          resumen.enviados++;
        } catch (error) {
          const codigo = (error as { statusCode?: number }).statusCode;
          if (codigo === 404 || codigo === 410 || codigo === 403) {
            caducadas.add(s.endpoint);
            resumen.caducados++;
          } else {
            resumen.fallidos++;
            console.error("Envío fallido", codigo, (error as Error).message);
          }
        }
      })
    );
    await Promise.all(envios);

    if (caducadas.size) {
      await supabase.from("suscripciones_push").delete().in("endpoint", [...caducadas]);
    }
  }

  return responder(resumen);
});
