# Variables de entorno

Dónde se ponen: **Netlify → el sitio del CRM → Site configuration →
Environment variables**. Después de agregar o borrar una hay que volver a
publicar (**Deploys → Trigger deploy → Deploy site**); Netlify las lee al
compilar, no en cada visita.

Ninguna de estas se escribe en el repositorio. Las que no llevan el prefijo
`NEXT_PUBLIC_` **nunca llegan al navegador**: Next las deja del lado del
servidor, y por eso los secretos van sin ese prefijo. Si a una llave secreta
se le pone `NEXT_PUBLIC_` por error, queda escrita en el paquete que descarga
cualquiera que abra la página.

---

## Las que el CRM necesita para funcionar

| Variable | Para qué | Sin ella |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Dirección del proyecto de Supabase. | El CRM muestra la pantalla de login explicando que falta configuración. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Llave pública. Es la que usa el navegador y está limitada por las políticas de la base. | Igual que arriba. |
| `SUPABASE_SERVICE_ROLE_KEY` | Llave de servicio. **Se salta todas las políticas de la base.** La usan la creación de cuentas y la API de n8n. | No se pueden crear usuarios ni usar `/api/v1`. El resto del CRM anda igual. |

> `SUPABASE_SERVICE_ROLE_KEY` es la más delicada de todas. Va **sin**
> `NEXT_PUBLIC_`, siempre.

## WhatsApp

Cuatro variables, y hacen cosas distintas aunque dos suenen parecido.

| Variable | Para qué | De dónde sale |
|---|---|---|
| `WHATSAPP_VERIFY_TOKEN` | Una contraseña **que inventás vos** y escribís en dos lados: acá y en Meta al configurar el webhook. Meta la manda una sola vez, cuando guardás la URL, para comprobar que la dirección es tuya. | La inventás. Cualquier texto largo sirve. |
| `WHATSAPP_APP_SECRET` | Con esto se comprueba la firma de **cada** mensaje que llega. Es lo que impide que alguien que descubra la URL invente conversaciones enteras. | Meta → tu app → Configuración → Básica → «Clave secreta de la app». |
| `WHATSAPP_TOKEN` | Permiso para **mandar** mensajes desde el número de la escuela. | Meta → tu app → WhatsApp → Configuración de la API. |
| `WHATSAPP_PHONE_NUMBER_ID` | Desde qué número sale el mensaje. Es un número de identificación, no el teléfono. | Mismo lugar que el anterior. |

**La diferencia entre las dos primeras**, que es donde todo el mundo se
confunde: `WHATSAPP_VERIFY_TOKEN` se usa **una vez**, el día que conectás el
webhook, y es un texto que elegiste vos. `WHATSAPP_APP_SECRET` se usa **en
cada mensaje**, y lo da Meta. Si borrás la primera después de conectar, el
webhook ya conectado sigue funcionando, pero no vas a poder reconectarlo ni
cambiar la URL sin volver a ponerla.

Sin `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` la bandeja recibe mensajes
pero no puede contestar: el cuadro de respuesta avisa que falta configurar.

## La API para n8n y el asistente

| Variable | Para qué |
|---|---|
| `CRM_API_KEYS` | Las llaves que abren `/api/v1`, separadas por coma y con un nombre adelante: `n8n:LLAVE1,asistente:LLAVE2`. Una por integración, para poder cortarle el acceso a una sin tocar la otra. |

Sin ella la API contesta `503 sin_configurar` y no deja entrar a nadie, que es
lo correcto: viene apagada hasta que alguien decida prenderla. El detalle está
en [API.md](API.md).

## Opcional

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_ENTORNO` | Cuando vale `pruebas`, el CRM muestra un aviso de que no es el sitio real. Lo pone `netlify.toml` solo en las ramas que no son `main`; no hace falta escribirla a mano. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Nombre nuevo que Supabase le está dando a la llave pública. Se lee como alternativa a `NEXT_PUBLIC_SUPABASE_ANON_KEY`; con tener una de las dos alcanza. |

---

## Las que ya no sirven: se pueden borrar

Chatwoot se sacó del CRM. **Ningún archivo del proyecto lee estas variables**,
así que borrarlas de Netlify no rompe nada:

- `CHATWOOT_URL`
- `CHATWOOT_ACCOUNT_ID`
- `CHATWOOT_INBOX_ID`
- `CHATWOOT_TOKEN`
- `CHATWOOT_WEBHOOK_SECRET`

**Ojo con no confundirse:** `CHATWOOT_WEBHOOK_SECRET` es la que se borra;
`WHATSAPP_VERIFY_TOKEN` **se queda**. Las dos servían para lo mismo —probar que
quien llama al webhook es quien dice ser— pero cada una contra su plataforma, y
la de WhatsApp es la que sigue en uso.

Para comprobar que la lista de arriba está al día, esto imprime todas las
variables que el código lee de verdad:

```sh
grep -rho "process\.env\.[A-Z_0-9]*" src/ | sort -u
```

Si alguna `CHATWOOT_` vuelve a aparecer ahí, es que algo la volvió a usar.
