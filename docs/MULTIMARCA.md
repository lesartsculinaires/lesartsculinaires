# CRM multimarca — plan

**Estado:** propuesta, nada implementado. Escrita el 9 de octubre de 2026 a partir
de lo que hay hoy en la base de producción y en el código.

**Lo que se pide:** varias marcas dentro del mismo CRM; que se pueda cambiar de
una a otra; que cada marca tenga sus roles del CRM base; que no se afecten entre
sí; y que todas usen la misma infraestructura y la base de Les Arts Culinaires.

---

## 1. La recomendación en un párrafo

**Una sola base de datos, con una columna `marca_id` en todo lo que es de una
marca, y la seguridad de Supabase (RLS) haciendo cumplir el aislamiento.**
Les Arts Culinaires pasa a ser la marca número 1, con todos sus datos de hoy. Cada
marca nueva se crea con una función que le copia los **roles base** (Administrador,
Gerente de ventas, Jefe de ventas, Ventas, Asesores, Asesor Secundario, Revisor) y
sus permisos. Una persona puede pertenecer a varias marcas, y la marca con la que
está trabajando viaja dentro de su sesión; al cambiar de marca, el CRM le pide a
Supabase un pase nuevo.

**Lo más importante de todo el plan:** hacerlo en dos tiempos. Primero se agrega
todo el andamiaje con **una sola marca (Les Arts)** y el CRM tiene que seguir
comportándose *exactamente igual* —las pruebas del banco y las de unidad tienen que
dar el mismo resultado que hoy—. Recién después se crea la segunda marca. Así el riesgo de romper la
operación de hoy queda acotado, y se puede comprobar.

---

## 2. Por qué esta opción y no las otras

| Opción | Aislamiento | Costo y trabajo | Encaja con «misma infraestructura y base» |
|---|---|---|---|
| **A. Una base, `marca_id` + RLS** *(recomendada)* | Bueno, si se prueba bien | Una base, un despliegue, una migración | **Sí** |
| B. Un proyecto de Supabase por marca | El más fuerte | N proyectos que pagar y N migraciones que correr cada vez | No: son infraestructuras separadas |
| C. Un esquema (`schema`) por marca | Medio | Muy incómodo con PostgREST y las migraciones | No vale la pena |

La B tiene sentido sólo si alguna marca exige **separación legal o contractual de
los datos**, o si van a ser muchas marcas muy grandes. Si ese es el caso, díganlo
antes de empezar: cambia todo.

---

## 3. El modelo

```
marcas            id, nombre, activa, …           ← la lista de marcas
membresias        usuario, marca, rol, activo     ← quién está en qué marca, con qué rol
plataforma_admins usuario                         ← quién puede crear marcas (dueños)
roles             marca_id + lo de siempre        ← los roles son DE CADA MARCA
plantilla_roles   los roles base y sus permisos   ← de donde se copian al crear una marca
```

- **Un correo, varias marcas.** Hoy `usuarios` tiene un solo `rol_id` por persona.
  Pasa a ser una identidad (correo, nombre) y la pertenencia a cada marca vive en
  `membresias`.
- **Los roles son de cada marca**, copiados de la plantilla al crearla. Si una
  marca cambia los permisos de «Ventas», las otras no se enteran. Si después se
  quiere propagar un cambio de la plantilla, se hace a propósito, marca por marca.
- **«Dueño de la plataforma» no es lo mismo que «Administrador de una marca».**
  El Administrador manda dentro de su marca y nada más. Crear marcas y verlas todas
  es de otro nivel (`plataforma_admins`), y tiene que ser una puerta aparte.
- **La marca activa viaja en la sesión.** Se guarda como un dato firmado dentro del
  pase de Supabase (un *claim* del JWT, puesto por un «Custom Access Token Hook»).
  Cambiar de marca = una función que comprueba que la persona es de esa marca y le
  pide a Supabase un pase nuevo. Las políticas de seguridad leen ese dato, así que
  **no hay que tocar las ~100 consultas del código**: ya van como la persona y la
  base filtra sola.
- **Defensa extra:** la función que lee la marca activa vuelve a comprobar en
  `membresias` que la persona sigue siendo de esa marca. Si se la da de baja, deja
  de ver los datos al instante, sin esperar a que venza el pase (una hora).

**Una consecuencia que hay que decir claro:** como la marca va en la sesión del
navegador, dos pestañas del mismo navegador comparten marca. Para trabajar dos
marcas *a la vez*, hay que usar dos perfiles (o dos navegadores). Mostrar el nombre
y el color de la marca en un lugar muy visible, siempre, es parte del diseño: la
equivocación más cara de un CRM multimarca es escribirle a un cliente desde la
marca equivocada.

---

## 4. Qué es compartido y qué es de cada marca

Las 54 tablas de hoy, clasificadas.

**Compartido, sin `marca_id` — es el «CRM base» (5):**
`modulos` (las pantallas), `canales` (WhatsApp / Instagram / Messenger),
`tipos_evento`, `etapas`, `estados`.
*Etapas y estados quedan compartidos al principio porque varios disparadores de la
base («ganado» por etapa, etc.) dependen de ellos. Si una marca quiere otro embudo,
es una segunda etapa.*

**De cada marca, con `marca_id` (49):**

- **Acceso:** `roles`, `rol_permisos`, `usuarios` (→ `membresias`), `vendedores`
- **Clientes y ventas:** `clientes`, `oportunidades`, `oportunidad_notas`,
  `oportunidad_programas`, `oportunidad_etiquetas`, `cursos_realizados`,
  `seguimientos`, `recordatorios_pospuestos`, `fusiones`, `duplicados_descartados`,
  `enlaces_pago`, `motivos_perdida`, `territorios`, `productos`, `etiquetas`
- **Mensajería:** `conversaciones`, `mensajes`, `reacciones`, `contactos_canal`,
  `conversacion_etiquetas`, `adjuntos`, `llamadas`, `plantillas`, `plantillas_sync`,
  `envios`, `envio_destinatarios`, `canal_credenciales`
- **Operación:** `actividad`, `actividad_vista`, `autorizaciones`,
  `autorizaciones_tipo`, `eventos`, `formularios`, `formulario_campos`,
  `formulario_respuestas`, `importaciones`, `solicitudes_eliminacion`
- **Agente de IA / n8n:** `agente_casos`, `agente_config`, `agente_conocimiento`,
  `agente_eventos`, `agente_salida`, `documents`, `n8n_chat_histories`
- **Por revisar:** `lesart_crm` (554 filas; parece una tabla vieja de importación —
  hay que confirmar si todavía se usa antes de decidir)

**Recomendación:** poner `marca_id` en **todas** las de cada marca, incluso las que
podrían heredarlo de su tabla madre (un mensaje hereda de su conversación). Es más
ancho, pero deja las políticas de seguridad sin cruces entre tablas —más simples,
más rápidas y más difíciles de escribir mal—. Un segundo paso, de endurecimiento,
es agregar llaves foráneas compuestas (`marca_id, cliente_id`) para que la base
**impida** que algo de la marca A apunte a un cliente de la marca B.

---

## 5. Lo que más puede salir mal

Cada punto sale de algo que existe hoy en este CRM, no de una lista genérica.

### 5.1 Hay 43 reglas de acceso que dicen `true`

De las 94 políticas de la base, **43 le dan acceso a cualquier usuario logueado**:
`clientes_ver`, `clientes_editar`, `conversaciones_editar`, `oportunidades_editar`,
`enlaces_pago_equipo`, `envios_ver` y así. Con una sola marca eso significa «cada
asesor ve todo»: ya está anotado como pendiente en el informe de seguridad (§5) y
nadie lo decidió.

**Con varias marcas deja de ser una decisión: es una fuga entre marcas.** Una
persona de la marca B podría leer y editar clientes de la marca A. Las 38 que están
sobre tablas de cada marca hay que reescribirlas **todas** antes de que exista la
segunda marca. (Las otras 5 son de tablas compartidas.)

### 5.2 Hay 38 funciones `SECURITY DEFINER`, y esas se saltan la seguridad

De las 48 funciones de la base, 38 corren con permisos del dueño, o sea que **la
seguridad por fila no las alcanza**. Cada una tiene que saber de qué marca es, o
filtra mal. Dos ejemplos concretos, ya leídos:

- `cliente_de_whatsapp` busca al cliente por **los últimos 8 dígitos del teléfono**
  entre **todos** los clientes, y hasta su candado de concurrencia es global. Con
  dos marcas, alguien que le escribe a la marca B quedaría enlazado al cliente que
  ya tenía en la marca A: se mezclan las fichas y se filtran sus datos.
- `vendedores_para_reparto` devuelve los vendedores que reciben leads. Sin filtro
  de marca, **un lead de la marca B se le podría asignar a una asesora de la A.**
- `numerar_oportunidad` saca el próximo número del **máximo de todas las
  oportunidades** (`CRM-9918`): cada marca va a querer su serie, y con un candado
  que hoy es uno solo para todo el CRM.

### 5.3 El código que usa la llave de servicio (unos 27 usos en 21 archivos)

Los webhooks de WhatsApp, Instagram y Messenger, la API `/api/v1`, la creación de
usuarios y varios procesos de fondo usan la llave de servicio, que **se salta la
seguridad por fila**. Ahí nadie filtra por marca salvo el propio código. Un
`.eq("marca_id", …)` olvidado en uno solo de esos lugares es una fuga entre
marcas que ninguna política de la base va a frenar. Por eso el punto 7 (pruebas de
aislamiento) no es opcional.

### 5.4 La caché del catálogo es global

`src/lib/supabase/queries.ts` guarda el catálogo (programas, vendedores, etapas…)
cinco minutos, con **una sola clave para todos**. Con dos marcas, la marca B vería
durante cinco minutos los programas de la A. Es código mío de hace poco: la clave
tiene que llevar la marca. Y lo mismo la cookie del último módulo, y todo lo que se
guarde en el navegador.

### 5.5 Las credenciales de WhatsApp están en variables de entorno

`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`,
`WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN` son **una sola** para todo el CRM.
Cada marca va a tener su número y su cuenta de WhatsApp Business. Hay que moverlas
a la base, **por marca y cifradas** (Supabase Vault).

Lo bueno: Instagram y Messenger **ya** guardan sus cuentas en `canal_credenciales`
(una fila por cuenta conectada, con el flujo «Conectar con Facebook» ya hecho). El
trabajo es llevar WhatsApp al mismo esquema, no inventar uno nuevo.

**Cómo se sabe de qué marca es un mensaje que entra:**

- WhatsApp: el aviso de Meta trae el `phone_number_id` → se busca a qué marca
  pertenece ese número.
- Instagram y Messenger: el aviso trae el id de la página o cuenta → ya está en
  `canal_credenciales` → a esa fila se le agrega la marca.
- Y la **firma del aviso** se comprueba con el secreto de *esa* marca. Si todas las
  marcas usan la misma aplicación de Meta, el secreto es uno solo; si cada una
  trae la suya, hay uno por marca.

### 5.6 Restricciones de unicidad que chocarían

De los 27 índices únicos de la base, **12 hay que ampliar con la marca**, porque
hoy impiden que dos marcas tengan lo mismo:

| Hoy es único… | Problema |
|---|---|
| `roles.nombre`, `productos.nombre`, `territorios.nombre`, `etiquetas.nombre`, `motivos_perdida.nombre`, `autorizaciones_tipo.nombre` | Dos marcas no podrían tener un rol «Ventas» ni un programa con el mismo nombre. |
| `vendedores.correo`, `vendedores.nombre`, `vendedores.usuario_id` | La misma asesora no podría estar en dos marcas: hoy una persona es **una sola** asesora para todo el CRM. |
| `conversaciones (canal, identificador)` | **El mismo teléfono no podría escribirle a dos marcas.** |
| `oportunidades.codigo` (hay dos índices iguales) | Un solo contador de códigos para todas. |

Los demás (`mensajes.wa_id`, `llamadas.call_id`, tokens, `meta_booking_id`) son ids
que ya son únicos en el mundo y quedan como están.

### 5.7 Archivos

Los buckets `adjuntos` y `whatsapp` no saben de marcas: cualquier usuario logueado
puede **ver** cualquier archivo. Hay que poner la marca como primer tramo de la
ruta (`<marca_id>/…`) y que la política compruebe ese tramo. Los archivos de hoy se
mueven a `1/…` como parte de la migración.

### 5.8 Lo que ya anda lento se multiplica

La base hoy ya se pone lenta a media tarde con cuatro personas trabajando (p95 de
4,4 s a las 18:00 contra 0,5 s a las 14:00 —hora UTC, o sea 12:00 y 8:00 en El
Salvador—, con el mismo número de peticiones).
**Cada marca suma gente y suma peticiones.** Antes de la segunda marca conviene
terminar de bajar esa carga (el reloj de las llamadas es hoy el mayor consumidor, y
falta leer solo lo que cambió del embudo). Si no, la segunda marca se va a notar en
la primera.

Y toda política de seguridad nueva tiene que ir con `marca_id` **al principio** de
los índices, y llamando a la función de marca con la forma `(select …)` que ya usa
la base, para que se calcule una vez por consulta y no una vez por fila.

### 5.9 Datos cargados a mano en la aplicación

Integraciones que hoy suponen una sola marca y hay que mirar una por una: la API
`/api/v1` (`CRM_API_KEYS` ni siquiera está cargada todavía → quedan **llaves por
marca**, en la base), n8n (`N8N_WEBHOOK_URL`, `agente_config`), el agente de IA y su
base de conocimiento (`documents`), y los programas del módulo de Programas.

---

## 6. Las fases

Cada fase termina en algo **comprobable**. No se pasa a la siguiente sin eso.

### Fase 0 — Decisiones y red de seguridad
- Responder las preguntas de la sección 8.
- Trabajar en una **rama de Supabase** (`create_branch`), no en producción: se
  prueban las migraciones contra una copia con los datos reales.
- Copia de respaldo de producción antes de tocar nada.
- Terminar de bajar la carga actual (sección 5.8).
- **Listo cuando:** las decisiones están escritas aquí y existe la rama de pruebas.

### Fase 1 — Los cimientos, **sin cambiar nada visible**
- Crear `marcas`, `membresias`, `plataforma_admins`, `plantilla_roles`.
- Crear la marca 1 (Les Arts) y ponerle `marca_id = 1` a **todo** lo de hoy.
- Agregar `marca_id` a las 49 tablas; primero con valor por omisión y sin
  obligatoriedad, rellenar, y recién ahí hacerlo obligatorio.
- Que cada inserción tome la marca activa sola (un valor por omisión que la lee de
  la sesión), así el código de la aplicación no tiene que pasarla en cada alta.
- Reescribir `es_admin`, `ve_todo`, `puede` y `mi_vendedor_id` para que lean la
  pertenencia a la marca activa. Como todas las políticas dependen de esas cuatro,
  **el permiso queda por marca de golpe**.
- Reescribir las 38 políticas `true` y agregar la condición de marca a las demás.
- Ampliar los 12 índices únicos; reescribir las funciones `SECURITY DEFINER`
  (sección 5.2); mover los archivos a `1/…`.
- **Listo cuando:** con **una sola marca**, las pruebas del banco (hoy son 113
  archivos) y las 57 de unidad dan el mismo resultado que hoy —las pocas que hoy
  fallan por el entorno, como `prueba-reacciones` y `prueba-nota-de-voz`, seguirán
  igual—, y la prueba de aislamiento de la sección 7 está escrita y en verde con
  una marca de mentira cargada en el banco.

### Fase 2 — La aplicación
- Activar el *Custom Access Token Hook* y el selector de marca (con nombre y color
  bien visibles, siempre).
- Revisar cada uso de la llave de servicio y los 3 webhooks: cada uno recibe la
  marca explícitamente, desde el número o la cuenta que escribió.
- Caché del catálogo, cookies y almacenamiento del navegador **por marca**.
- Credenciales de WhatsApp de las variables de entorno a la base, cifradas.
- Alta de personas: «agregar a la marca» si el correo ya existe, no «crear cuenta».
- Resuscribirse al tiempo real al cambiar de marca.
- **Listo cuando:** en el banco con **dos** marcas, una persona de cada una trabaja
  una jornada simulada completa (entra un mensaje, se responde, se reparte un lead,
  se sube un archivo) y **ninguna ve ni toca nada de la otra**.

### Fase 3 — La segunda marca, en la rama
- Crear la marca B con la función de alta (copia los roles base).
- Conectar un número de WhatsApp de prueba.
- Probar el aviso cruzado: un mensaje de B que entra por el número de A **no puede
  caer en A** (ya existe `prueba-webhook-cruzado`; se extiende).

### Fase 4 — Producción
- Aplicar la migración en una ventana tranquila, con el respaldo hecho.
- Activar el hook en el panel de Supabase.
- Desplegar. Verificar. Recién entonces, dar de alta la primera marca nueva.

---

## 7. Las pruebas de aislamiento: el seguro de todo

Es lo que hace que este plan sea seguro y no una apuesta. El banco de pruebas ya
existe (Postgres + PostgREST local con todas las migraciones). Se le agrega:

1. **Una prueba que se genera sola a partir del catálogo de la base.** Para *cada*
   tabla de cada marca: se cargan datos de la marca A y de la B, se entra como una
   persona de A, y se comprueba que **no ve, no edita y no borra** nada de B. Y a la
   inversa. Como se arma leyendo las tablas de la base, **una tabla nueva que se
   olvide de la marca hace fallar la prueba** sin que nadie tenga que acordarse.
2. **Lo mismo para cada función `SECURITY DEFINER`**: se la llama como persona de A
   con datos de B a la vista.
3. **Lo mismo para cada ruta con llave de servicio** (los 3 webhooks, la API, la
   creación de usuarios): se simula una entrada de B y se comprueba dónde cae.
4. **Una prueba de «pertenencia»**: dar de baja a alguien de una marca y comprobar
   que deja de ver sus datos *en el momento*.
5. **Todas las pruebas de hoy** (113 en el banco, 57 de unidad), con una marca y con dos.

Estas pruebas tienen que correr **antes de cada despliegue** de aquí en adelante.

---

## 8. Decisiones que necesito de ustedes

Cada una con lo que recomiendo; cambian el diseño si la respuesta es otra.

1. **¿La misma persona puede trabajar en varias marcas con el mismo correo?**
   *Recomiendo: sí.* Es lo que se describió («cambia de sesión»). Si fuera que no,
   todo es más simple.
2. **¿Cada marca tiene su propio número de WhatsApp y su propia página de
   Facebook/Instagram?** ¿Y su propia aplicación de Meta, o usan la de la escuela?
   *Recomiendo: números y páginas propias, una sola aplicación de Meta.* Define
   cómo se firman los avisos (sección 5.5).
3. **¿Los programas (productos) son distintos por marca?** *Recomiendo: sí.*
   ¿Y el embudo —las etapas— igual para todas? *Recomiendo: igual al principio.*
4. **¿Se comparten clientes entre marcas?** *Recomiendo: no.* El mismo teléfono puede
   existir en las dos marcas como dos clientes independientes.
5. **¿Cómo se entra a cada marca?** *Recomiendo: un selector dentro del CRM, en la
   misma dirección.* Más adelante, si lo quieren, una dirección propia por marca
   (`marca.crm…`) es posible, pero necesita un dominio propio.
6. **¿Quién puede crear marcas?** *Recomiendo: sólo ustedes*, con un nivel
   «dueño de la plataforma» separado del Administrador de cada marca.
7. **¿Cuántas marcas se prevén?** Dos o tres es lo que este plan supone. Si son
   decenas, cambia el cálculo de costos y de rendimiento.
8. **¿Alguna marca exige datos físicamente separados** (legal, contrato, cliente
   grande)? Si sí, la opción B de la sección 2.

---

## 9. Lo que sólo ustedes pueden hacer

Cosas que no se pueden hacer desde el código ni desde aquí:

- **Panel de Supabase:** activar el *Custom Access Token Hook* (Authentication →
  Hooks) en la Fase 4, y confirmar que el plan Pro incluye el respaldo diario.
- **Meta:** por cada marca nueva, conectar su número de WhatsApp Business y su
  página; si hay aplicaciones distintas, pasar el secreto de cada una por un canal
  seguro (nunca por el chat).
- **Netlify / dominio:** sólo si se quiere una dirección propia por marca.
- **Antes de la Fase 4:** avisar al equipo de la ventana de migración.
- Pendientes de siempre que **este plan vuelve urgentes**: rotar
  `SUPABASE_SERVICE_ROLE_KEY` y los secretos de Meta, y cargar `CRM_API_KEYS`.
