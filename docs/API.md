# API del CRM — para n8n y el asistente

Esta es la puerta por la que una automatización entra al CRM sin pasar por la
pantalla. Hace lo mismo que hace una persona: dar de alta un lead, agendar un
seguimiento, consultar qué hay.

Base: `https://crm-les-arts.netlify.app/api/v1`

---

## 1. Antes de nada: prender la API

La API viene apagada. Se prende poniendo una variable en Netlify, y hasta que
esa variable exista todos los endpoints contestan `503 sin_configurar`.

**Netlify → el sitio del CRM → Site configuration → Environment variables →
Add a variable:**

| Nombre | Valor |
|---|---|
| `CRM_API_KEYS` | `n8n:LLAVE1,asistente:LLAVE2` |

Las llaves las inventás vos. Que sean largas y al azar — 32 caracteres o más.
Una forma de sacar una, desde cualquier terminal:

```
openssl rand -base64 32
```

Van separadas por coma, cada una con un nombre adelante y dos puntos. El
nombre no es la contraseña: sirve para saber en el registro del servidor quién
dio de alta qué, y para poder cortarle el acceso a uno sin tocar al otro.
**Una llave por integración.** Si mañana hay que sacar a n8n, se borra esa
entrada de la lista y el asistente sigue funcionando.

Después de guardar la variable hay que volver a publicar el sitio
(**Deploys → Trigger deploy → Deploy site**) para que la tome.

> La API usa la llave de servicio de Supabase, que ya está configurada
> (`SUPABASE_SERVICE_ROLE_KEY`). Sin ella los endpoints también contestan
> `503`.

### La migración

Antes de usar `/asesores` hay que correr en Supabase → SQL Editor:

```
supabase/migrations/20260817120000_vendedores_telefono.sql
```

Agrega la columna del WhatsApp de cada asesor, que hasta ahora no existía.
Sólo agrega una columna vacía: se puede correr con gente trabajando, y correrla
dos veces no rompe nada. Después hay que cargar los números en Supabase →
Table editor → `vendedores` → columna `telefono`, en formato `50371000001`
(sólo dígitos, con el 503 adelante). El endpoint avisa cuántos faltan.

---

## 2. Cómo se autentica

Una llave en la cabecera. Las dos formas valen, la que le quede más cómoda a
la herramienta:

```
Authorization: Bearer TU_LLAVE
```
```
X-API-Key: TU_LLAVE
```

En n8n: nodo **HTTP Request** → Authentication: **Generic Credential Type** →
**Header Auth** → Name `X-API-Key`, Value tu llave. Guardala como credencial,
no la escribas dentro del nodo: así no queda a la vista de quien abra el flujo.

Sin llave o con llave equivocada: `401 sin_permiso`.

---

## 3. Los endpoints

Todos contestan JSON. Cuando algo sale mal, siempre con la misma forma:

```json
{ "ok": false, "codigo": "duplicado", "error": "Ya existe un contacto con estos datos." }
```

`codigo` es lo que conviene comparar en un `IF` de n8n; `error` es el texto
para leer.

### `GET /catalogos` — los valores válidos

Empezá por acá: si contesta, la llave está bien puesta.

```bash
curl https://crm-les-arts.netlify.app/api/v1/catalogos \
  -H "X-API-Key: TU_LLAVE"
```

Devuelve `programas`, `sedes`, `canales`, `etapas`, `estados` y
`tipos_evento`, cada uno con su `id` y su `nombre`. Son los valores que se
pueden mandar en los otros endpoints.

### `POST /leads` — dar de alta

Lo único obligatorio es `nombre`.

```bash
curl -X POST https://crm-les-arts.netlify.app/api/v1/leads \
  -H "X-API-Key: TU_LLAVE" -H "Content-Type: application/json" \
  -d '{
    "nombre": "Ana Pérez",
    "telefono": "7100-0001",
    "correo": "ana@ejemplo.com",
    "programa": "Diplomado de Pasteleria",
    "canal": "Facebook",
    "sede": "San Salvador",
    "asesor": "Katya Villatoro"
  }'
```

**Los catálogos aceptan el nombre o el id.** `"programa": "Diplomado de
Pasteleria"` y `"programa": 2` hacen lo mismo, así que el flujo de n8n no
necesita llevar una tabla de equivalencias escrita adentro. La comparación
ignora acentos y mayúsculas.

Campos que acepta: `nombre`, `telefono`, `correo` (o `email`), `programa` (o
`producto`), `canal`, `sede` (o `territorio`), `asesor` (o `vendedor`),
`etapa`, `estado`, `fecha_registro`, `fecha_cierre`, `valor_oportunidad` (o
`valor`), `descuento_promocion` (o `promocion`), `forzar`.

Sin `fecha_registro`, se usa la de hoy.

Respuesta:

```json
{ "ok": true, "codigo": "CRM-0582", "cliente_id": 341, "oportunidad_id": 588 }
```

**Repetidos.** Si ya hay alguien con ese teléfono, ese correo o ese nombre,
contesta `409 duplicado` y **no crea nada**, con la lista de a quién se parece:

```json
{
  "ok": false, "codigo": "duplicado",
  "coincidencias": [{ "clienteId": 12, "nombre": "Ana Pérez",
                      "telefono": "7100-0001", "motivos": ["telefono"] }]
}
```

Esto es lo que salva de duplicar la ficha cuando Meta reenvía el mismo
formulario o la persona lo llena dos veces. En n8n, un `IF` sobre el código
`duplicado` deja mandarle el aviso al asesor que ya la tiene, en vez de crear
un lead nuevo. Si igual querés crearlo, mandá `"forzar": true`.

> El alta pasa por exactamente el mismo camino que el formulario de la
> pantalla: busca repetidos, crea la persona, le asigna el código `CRM-XXXX` y
> le crea la oportunidad. Un lead cargado por n8n queda idéntico a uno cargado
> a mano. Por eso hay que usar este endpoint y no escribir directo en las
> tablas de Supabase: insertar en `clientes` sin su oportunidad deja a esa
> persona invisible en todas las pantallas del CRM.

### `GET /leads` — consultar

Para que el asistente sepa de qué está hablando antes de contestar.

```
GET /leads?telefono=7100-0001
GET /leads?codigo=CRM-0582
GET /leads?asesor=Katya%20Villatoro&desde=2026-08-01&limite=100
```

Parámetros: `codigo`, `telefono`, `correo`, `asesor`, `desde`, `limite` (hasta
200, por defecto 50). Devuelve la ficha con los nombres ya resueltos —
programa, etapa, asesor— no ids sueltos.

La búsqueda por teléfono compara los últimos 8 dígitos, así que `7100-0001`,
`7100 0001` y `+503 7100 0001` encuentran a la misma persona.

### `POST /eventos` — agendar un seguimiento

Es la «tarea» del CRM: aparece en el Calendario del asesor. Siempre pertenece
a una oportunidad.

```bash
curl -X POST https://crm-les-arts.netlify.app/api/v1/eventos \
  -H "X-API-Key: TU_LLAVE" -H "Content-Type: application/json" \
  -d '{
    "codigo": "CRM-0582",
    "tipo": "Llamada",
    "inicia_en": "2026-08-20T15:00:00-06:00",
    "canal": "WhatsApp",
    "proxima_accion": "Confirmar si le sirve el horario de sábado"
  }'
```

`codigo` (o `oportunidad_id`), `tipo` e `inicia_en` son obligatorios.
`inicia_en` va en formato ISO **con la zona horaria**: sin el `-06:00` la hora
se interpreta en UTC y el evento cae seis horas después en la agenda.

Opcionales: `asesor` (si no se manda, hereda el de la oportunidad),
`duracion_min` (30), `canal` (`Presencial`, `Llamada`, `WhatsApp`, `Meet`),
`estado` (`Pendiente`, `Realizado`, `No se presentó`, `Reagendado`),
`resultado`, `proxima_accion` (o `nota`).

### `GET /eventos` — qué hay agendado

```
GET /eventos?asesor=Katya%20Villatoro&desde=2026-08-17&hasta=2026-08-24
GET /eventos?codigo=CRM-0582
GET /eventos?estado=Pendiente
```

### `GET /asesores` — a quién avisarle

```json
{
  "ok": true, "total": 4, "sin_whatsapp": 1,
  "asesores": [
    { "id": 4, "nombre": "Katya Villatoro", "correo": null,
      "whatsapp": "50371000001", "activo": true }
  ]
}
```

Por defecto sólo los activos; `?todos=1` trae también a los dados de baja.
`sin_whatsapp` es cuántos no tienen número cargado: un flujo que reparte por
WhatsApp falla en silencio con esos, y así se ve antes de que pase.

---

## 4. Un flujo de ejemplo en n8n

**Lead de Facebook → CRM → aviso al asesor**

1. **Facebook Lead Ads Trigger** — o un **Webhook**, si el formulario es otro.
2. **HTTP Request** → `POST /api/v1/leads` con lo que trajo el formulario.
   En *Options* activá **Never Error** para que el `409` no corte el flujo.
3. **IF** → `{{ $json.codigo === "duplicado" }}`
   - **Sí**: ya está cargada. Mandale el aviso al asesor que ya la tiene
     (`$json.coincidencias[0]`) en vez de crear otra ficha.
   - **No**: sigue.
4. **HTTP Request** → `GET /api/v1/asesores` y elegí a quién le toca (por
   turno, por programa, como se reparta hoy).
5. **HTTP Request** → `POST /api/v1/eventos` con `codigo` del paso 2 y
   `inicia_en` dentro de las próximas horas: así el seguimiento queda en el
   Calendario y no depende de que alguien se acuerde.
6. **WhatsApp / correo** → avisale al asesor, con el `whatsapp` del paso 4.

**Para el asistente:** dale las cuatro lecturas (`/catalogos`, `/leads`,
`/eventos`, `/asesores`) y las dos escrituras (`POST /leads`,
`POST /eventos`). Con eso puede responder «¿qué tengo agendado hoy?», «¿ya
está cargada esta persona?» y «agendale una llamada mañana a las 3».

---

## 5. Cosas que conviene saber

- **Todo o nada.** Si el alta no puede terminar, no deja al cliente a medio
  crear: lo borra. Nunca queda una persona sin oportunidad, que es la única
  forma de que un lead exista en la base pero no se vea en ninguna pantalla.

- **La llave abre todo.** No hay permisos por rol acá: quien tiene la llave
  puede leer y escribir como si fuera administrador. Por eso una llave por
  integración, y por eso no se pegan en un chat ni en el flujo a la vista.

- **Si algo devuelve `503 sin_configurar`**, falta `CRM_API_KEYS` o falta
  volver a publicar el sitio después de agregarla.

- **Si `/asesores` devuelve `503 falta_migracion`**, falta correr
  `20260817120000_vendedores_telefono.sql` en Supabase.

- **Los webhooks de WhatsApp son otra cosa.** `/api/whatsapp/webhook` y
  `/api/chatwoot/webhook` no usan esta llave: van firmados por Meta y por
  Chatwoot. No los toques desde n8n.
