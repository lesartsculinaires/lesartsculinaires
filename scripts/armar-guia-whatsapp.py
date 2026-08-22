"""
Guía en PDF para conectar WhatsApp API, n8n y el agente de IA al CRM.

Se arma con reportlab y las fuentes DejaVu del sistema: las que trae reportlab
de fábrica no tienen las tildes ni la ñ completas, y en un documento en español
eso se ve enseguida.
"""

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, KeepTogether, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
)

RUTA = "/home/user/lesartsculinaires/docs/Conectar-WhatsApp-n8n-IA.pdf"

# ----------------------------------------------------------------- tipografía
FUENTES = "/usr/share/fonts/truetype/dejavu"
pdfmetrics.registerFont(TTFont("Dej", f"{FUENTES}/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("Dej-B", f"{FUENTES}/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Mono", f"{FUENTES}/DejaVuSansMono.ttf"))
# No hay cursiva de DejaVu Sans en el sistema; la familia se registra sin
# ella. El documento no la usa, así que no falta nada.
pdfmetrics.registerFontFamily("Dej", normal="Dej", bold="Dej-B")

# Los colores del CRM, para que el documento se reconozca como suyo.
AZUL = colors.HexColor("#031B4F")
AMBAR = colors.HexColor("#7A5A12")
FONDO_AMBAR = colors.HexColor("#F6EEDC")
ROJO = colors.HexColor("#B85042")
FONDO_ROJO = colors.HexColor("#FBEDEB")
VERDE = colors.HexColor("#2F6B4F")
GRIS = colors.HexColor("#5B6B8C")
LINEA = colors.HexColor("#DCE1EC")
PAPEL = colors.HexColor("#F4F6FA")

base = getSampleStyleSheet()

E = {
    "titulo": ParagraphStyle("titulo", parent=base["Title"], fontName="Dej-B",
                             fontSize=23, leading=28, textColor=AZUL,
                             alignment=TA_LEFT, spaceAfter=4),
    "bajada": ParagraphStyle("bajada", fontName="Dej", fontSize=10.5, leading=16,
                             textColor=GRIS, spaceAfter=16),
    "h1": ParagraphStyle("h1", fontName="Dej-B", fontSize=14, leading=19,
                         textColor=AZUL, spaceBefore=16, spaceAfter=7),
    "h2": ParagraphStyle("h2", fontName="Dej-B", fontSize=11, leading=15,
                         textColor=AZUL, spaceBefore=11, spaceAfter=5),
    "p": ParagraphStyle("p", fontName="Dej", fontSize=10, leading=15.5,
                        textColor=colors.HexColor("#1F2A44"), spaceAfter=7),
    "li": ParagraphStyle("li", fontName="Dej", fontSize=10, leading=15.5,
                         textColor=colors.HexColor("#1F2A44"),
                         leftIndent=13, bulletIndent=3, spaceAfter=4),
    "cel": ParagraphStyle("cel", fontName="Dej", fontSize=9, leading=13.5,
                          textColor=colors.HexColor("#1F2A44")),
    "cel_b": ParagraphStyle("cel_b", fontName="Dej-B", fontSize=9, leading=13.5,
                            textColor=AZUL),
    "cel_m": ParagraphStyle("cel_m", fontName="Mono", fontSize=8.5, leading=13,
                            textColor=AZUL),
    "codigo": ParagraphStyle("codigo", fontName="Mono", fontSize=9, leading=14,
                             textColor=AZUL, leftIndent=8, spaceBefore=3,
                             spaceAfter=8),
    "aviso": ParagraphStyle("aviso", fontName="Dej", fontSize=9.5, leading=14.5,
                            textColor=AMBAR),
    "aviso_t": ParagraphStyle("aviso_t", fontName="Dej-B", fontSize=9.5,
                              leading=14.5, textColor=AMBAR),
    "alerta": ParagraphStyle("alerta", fontName="Dej", fontSize=9.5, leading=14.5,
                             textColor=ROJO),
    "alerta_t": ParagraphStyle("alerta_t", fontName="Dej-B", fontSize=9.5,
                               leading=14.5, textColor=ROJO),
    "pie": ParagraphStyle("pie", fontName="Dej", fontSize=8, leading=11,
                          textColor=GRIS),
}


def p(txt, estilo="p"):
    return Paragraph(txt, E[estilo])


def vinetas(items, estilo="li"):
    return [Paragraph(t, E[estilo], bulletText="•") for t in items]


def caja(titulo, cuerpo, tono="ambar"):
    """Un recuadro de aviso. Se mantiene entero: partido a la mitad no se lee."""
    fondo, texto_t, texto_c = (
        (FONDO_AMBAR, "aviso_t", "aviso") if tono == "ambar"
        else (FONDO_ROJO, "alerta_t", "alerta")
    )
    dentro = [Paragraph(titulo, E[texto_t]), Spacer(1, 3), Paragraph(cuerpo, E[texto_c])]
    t = Table([[dentro]], colWidths=[165 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fondo),
        ("LEFTPADDING", (0, 0), (-1, -1), 11),
        ("RIGHTPADDING", (0, 0), (-1, -1), 11),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("LINEBEFORE", (0, 0), (0, -1), 3, ROJO if tono == "rojo" else AMBAR),
    ]))
    return KeepTogether([t, Spacer(1, 9)])


def tabla(filas, anchos, cabecera=True):
    t = Table(filas, colWidths=anchos, repeatRows=1 if cabecera else 0)
    estilo = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, LINEA),
        ("BOX", (0, 0), (-1, -1), 0.5, LINEA),
    ]
    if cabecera:
        estilo += [("BACKGROUND", (0, 0), (-1, 0), PAPEL),
                   ("LINEBELOW", (0, 0), (-1, 0), 0.8, LINEA)]
    t.setStyle(TableStyle(estilo))
    return KeepTogether([t, Spacer(1, 10)])


def paso(n, titulo, sigue=None):
    """
    El número del paso, en un círculo, junto a su título.

    `sigue` viaja pegado al título. Un encabezado solo al pie de una página
    manda a buscar el resto a la vuelta, que es justo lo que una guía de pasos
    no puede permitirse.
    """
    num = Table([[Paragraph(f'<font color="#FFFFFF">{n}</font>',
                            ParagraphStyle("n", fontName="Dej-B", fontSize=11,
                                           leading=13, alignment=1))]],
                colWidths=[9 * mm], rowHeights=[9 * mm])
    num.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), AZUL),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    fila = Table([[num, Paragraph(titulo, E["h1"])]],
                 colWidths=[12 * mm, 153 * mm])
    fila.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return KeepTogether([fila, sigue]) if sigue is not None else fila


def pie(canvas, doc):
    canvas.saveState()
    canvas.setFont("Dej", 8)
    canvas.setFillColor(GRIS)
    canvas.drawString(22 * mm, 12 * mm, "Les Arts Culinaires · CRM")
    canvas.drawRightString(188 * mm, 12 * mm, f"Página {doc.page}")
    canvas.setStrokeColor(LINEA)
    canvas.setLineWidth(0.5)
    canvas.line(22 * mm, 16 * mm, 188 * mm, 16 * mm)
    canvas.restoreState()


# --------------------------------------------------------------- el contenido
h = []

h.append(p("Conectar WhatsApp API, n8n<br/>y el agente de IA", "titulo"))
h.append(p("Guía paso a paso para el CRM de Les Arts Culinaires. Escrita contra "
           "lo que el CRM ya tiene construido: el webhook, la API para "
           "automatizaciones y el módulo de Plantillas.", "bajada"))

# ---- el conflicto
h.append(p("Lo primero: el conflicto que hay que evitar", "h1"))
h.append(p("Una cuenta de WhatsApp Business tiene <b>una sola</b> URL de webhook. "
           "Si la apuntás a n8n, el CRM deja de recibir mensajes —la bandeja se "
           "queda muda y sin dar error—. Si la apuntás al CRM, n8n no se entera "
           "de nada. Ese es el 90% de los problemas de esta integración."))

h.append(p("Hay dos salidas:", "p"))
h.append(tabla([
    [p("Opción", "cel_b"), p("Cómo funciona", "cel_b"), p("Qué pasa si falla", "cel_b")],
    [p("<b>A</b> — recomendada", "cel"),
     p("El webhook apunta al CRM. El CRM guarda el mensaje en la bandeja y "
       "después le pasa una copia a n8n.", "cel"),
     p("Si n8n se cae, perdés automatización. El mensaje del cliente queda "
       "guardado igual.", "cel")],
    [p("<b>B</b>", "cel"),
     p("El webhook apunta a n8n, que después le reenvía al CRM.", "cel"),
     p("Si n8n se cae, <b>se pierde el mensaje del cliente</b> y nadie se "
       "entera hasta que reclama.", "cel")],
], [28 * mm, 68 * mm, 69 * mm]))

h.append(caja("Esto todavía no existe en el CRM",
              "El CRM recibe el webhook, pero no reenvía nada a n8n. Ese pedazo "
              "hay que agregarlo: son unas líneas al final del webhook. Es el "
              "paso 5 de esta guía."))

h.append(caja("Rotá dos credenciales antes de empezar",
              "En una conversación anterior quedó a la vista una API key de Meta "
              "y un token de verificación de Chatwoot. Cambiálos antes de montar "
              "esto, o vas a construir la integración sobre credenciales "
              "quemadas.", tono="rojo"))

# ---- paso 1
h.append(paso(1, "Meta: conseguir los datos",
              p("En <b>developers.facebook.com</b> → tu app → WhatsApp → API Setup:")))
h.append(tabla([
    [p("Variable", "cel_b"), p("Dónde está", "cel_b")],
    [p("WHATSAPP_TOKEN", "cel_m"),
     p("Un token <b>permanente</b> de usuario del sistema. No el temporal.", "cel")],
    [p("WHATSAPP_PHONE_NUMBER_ID", "cel_m"),
     p("En API Setup, debajo del número.", "cel")],
    [p("WHATSAPP_WABA_ID", "cel_m"),
     p("El id de la cuenta de WhatsApp Business.", "cel")],
    [p("WHATSAPP_APP_SECRET", "cel_m"),
     p("Configuración → Básica → «Clave secreta de la app».", "cel")],
    [p("WHATSAPP_VERIFY_TOKEN", "cel_m"),
     p("Lo inventás vos: cualquier texto largo. Sirve para que Meta y el CRM "
       "se reconozcan al dar de alta el webhook.", "cel")],
], [58 * mm, 107 * mm]))

h.append(caja("El token de 24 horas es una trampa",
              "El que Meta muestra primero vence en un día, y cuando vence todo "
              "deja de andar sin explicación. Creá el permanente desde el "
              "principio: Business Settings → Usuarios del sistema → Generar "
              "token, con los permisos whatsapp_business_messaging y "
              "whatsapp_business_management."))

# ---- paso 2
h.append(paso(2, "Netlify: cargar las variables",
              p("Site settings → Environment variables. Las cinco de arriba, tal cual.")))
h.append(caja("Ninguna lleva NEXT_PUBLIC_",
              "Una variable con ese prefijo viaja al navegador. El token de "
              "WhatsApp con NEXT_PUBLIC_ queda a la vista de cualquiera que "
              "abra el CRM y mire el código de la página.", tono="rojo"))
h.append(p("<b>Después de guardarlas hay que redesplegar.</b> Netlify no toma "
           "variables nuevas en caliente, y saltarse esto es la causa más común "
           "de que el paso siguiente falle."))

# ---- paso 3
h.append(paso(3, "Meta: apuntar el webhook al CRM",
              p("WhatsApp → Configuration → Webhook → Edit:")))
h.append(p("<b>Callback URL</b>", "h2"))
h.append(p("https://crm-les-arts.netlify.app/api/whatsapp/webhook", "codigo"))
h.append(p("<b>Verify token</b>: el mismo <font name='Mono' size='9'>"
           "WHATSAPP_VERIFY_TOKEN</font> que pusiste en Netlify.<br/>"
           "<b>Campo a suscribir</b>: <font name='Mono' size='9'>messages</font>."))
h.append(caja("Probá acá antes de seguir",
              "Mandale un WhatsApp al número desde tu teléfono. Tiene que "
              "aparecer en el Inbox del CRM. Si no aparece, no sigas con n8n: el "
              "problema está en este paso y n8n sólo lo va a esconder."))

# ---- paso 4
h.append(paso(4, "n8n: la llave para escribir en el CRM",
              p("En Netlify agregá una variable más:")))
h.append(p("CRM_API_KEYS = n8n:&lt;una-clave-larga-al-azar&gt;", "codigo"))
h.append(p("Con eso n8n usa la API que el CRM ya tiene, mandando la cabecera "
           "<font name='Mono' size='9'>Authorization: Bearer &lt;la-clave&gt;</font>."))
h.append(tabla([
    [p("Para", "cel_b"), p("Endpoint", "cel_b")],
    [p("Crear un lead", "cel"), p("POST /api/v1/leads", "cel_m")],
    [p("Consultar leads", "cel"), p("GET /api/v1/leads", "cel_m")],
    [p("Ver los catálogos", "cel"), p("GET /api/v1/catalogos", "cel_m")],
    [p("Agendar algo", "cel"), p("POST /api/v1/eventos", "cel_m")],
    [p("Ver los asesores", "cel"), p("GET /api/v1/asesores", "cel_m")],
], [70 * mm, 95 * mm]))
h.append(caja("Nunca escribas directo en Supabase desde n8n",
              "Un alta son cuatro pasos: buscar repetidos, crear la persona, "
              "asignarle el código CRM-XXXX y crear la oportunidad. Saltándolos, "
              "los leads de n8n quedan distintos de los demás y el aviso de "
              "duplicados no corre. Usá siempre /api/v1/leads.", tono="rojo"))

# ---- paso 5
h.append(paso(5, "El reenvío del CRM hacia n8n",
              p("Es la pieza que falta construir. El CRM guarda el mensaje en la "
           "bandeja y, hecho eso, le manda una copia al webhook de n8n. En ese "
           "orden: si n8n está caído, el mensaje ya quedó guardado.")))
h.append(p("Hace falta una variable con la URL del webhook de n8n y, "
           "conviene, una firma o una llave para que n8n sepa que la llamada "
           "viene del CRM y no de cualquiera."))

# ---- paso 6
h.append(paso(6, "El agente de IA",
              p("Acá la decisión importante no es técnica: <b>¿el agente le contesta "
           "al cliente, o le sugiere al asesor?</b>")))
h.append(tabla([
    [p("Modo", "cel_b"), p("A favor", "cel_b"), p("En contra", "cel_b")],
    [p("<b>Contesta solo</b>", "cel"),
     p("Responde a cualquier hora, sin esperar a nadie.", "cel"),
     p("Una respuesta equivocada sobre precios o fechas sale por un número que "
       "la escuela reconoce como propio.", "cel")],
    [p("<b>Sugiere</b>", "cel"),
     p("Redacta y el asesor aprueba con un clic. Casi todo el valor, sin el "
       "riesgo.", "cel"),
     p("Necesita que haya alguien mirando.", "cel")],
], [30 * mm, 62 * mm, 73 * mm]))

h.append(p("Si arrancás con que conteste solo, ponele estos límites desde el "
           "primer día:", "p"))
h.extend(vinetas([
    "<b>Sólo fuera de horario</b>, o <b>sólo el primer mensaje</b> de un "
    "contacto nuevo.",
    "<b>Que se calle en cuanto un humano responda.</b> Si el asesor ya está "
    "escribiendo, el bot tiene que salir de esa conversación.",
    "<b>Que todo lo que mande quede en la bandeja del CRM</b>, marcado como del "
    "bot. Si contesta por fuera, el asesor abre el chat y no entiende qué se le "
    "dijo al cliente.",
]))
h.append(Spacer(1, 8))

h.append(caja("La regla de las 24 horas",
              "Fuera de esa ventana WhatsApp sólo deja mandar plantillas "
              "aprobadas. Un flujo que intente texto libre a las 30 horas "
              "devuelve el error 131047 y no llega nada. El módulo Plantillas "
              "del CRM ya muestra cuáles están aprobadas: que n8n use ésas."))

# ---- el orden
h.append(p("El orden que evita el dolor", "h1"))
h.append(p("Si mezclás los pasos 3 y 4, cuando algo falle no vas a saber si es "
           "Meta, el CRM o n8n."))
h.append(tabla([
    [p("Orden", "cel_b"), p("Qué hacer", "cel_b"), p("Cómo sabés que salió bien", "cel_b")],
    [p("1", "cel"), p("Variables en Netlify y redesplegar.", "cel"),
     p("El despliegue termina sin error.", "cel")],
    [p("2", "cel"), p("Webhook apuntando al CRM.", "cel"),
     p("Meta acepta la URL al guardar.", "cel")],
    [p("3", "cel"), p("<b>Mandar un WhatsApp de prueba.</b>", "cel"),
     p("El mensaje aparece en el Inbox del CRM.", "cel")],
    [p("4", "cel"), p("CRM_API_KEYS y los flujos de n8n.", "cel"),
     p("n8n crea un lead y aparece en Clientes.", "cel")],
    [p("5", "cel"), p("El reenvío del CRM a n8n (hay que construirlo).", "cel"),
     p("n8n recibe cada mensaje entrante.", "cel")],
    [p("6", "cel"), p("El agente, primero en modo sugerencia.", "cel"),
     p("Las respuestas quedan en la bandeja.", "cel")],
], [16 * mm, 78 * mm, 71 * mm]))

h.append(p("Cómo queda armado", "h1"))
h.append(p("Con la opción A, el camino de un mensaje entrante es éste:"))
h.append(Spacer(1, 4))

flujo = Table([[
    p("<b>Cliente</b><br/>escribe por<br/>WhatsApp", "cel"),
    p("→", "cel_b"),
    p("<b>Meta</b><br/>manda el<br/>webhook", "cel"),
    p("→", "cel_b"),
    p("<b>CRM</b><br/>lo guarda en<br/>la bandeja", "cel"),
    p("→", "cel_b"),
    p("<b>n8n</b><br/>recibe la copia<br/>y automatiza", "cel"),
]], colWidths=[32 * mm, 8 * mm, 32 * mm, 8 * mm, 34 * mm, 8 * mm, 36 * mm])
flujo.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("ALIGN", (1, 0), (1, 0), "CENTER"),
    ("ALIGN", (3, 0), (3, 0), "CENTER"),
    ("ALIGN", (5, 0), (5, 0), "CENTER"),
    ("BACKGROUND", (0, 0), (0, 0), PAPEL),
    ("BACKGROUND", (2, 0), (2, 0), PAPEL),
    ("BACKGROUND", (4, 0), (4, 0), colors.HexColor("#EAF2ED")),
    ("BACKGROUND", (6, 0), (6, 0), PAPEL),
    ("BOX", (4, 0), (4, 0), 1, VERDE),
    ("TOPPADDING", (0, 0), (-1, -1), 10),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
]))
h.append(flujo)
h.append(Spacer(1, 8))
h.append(p("El CRM está en el medio a propósito: es el único punto por el que "
           "pasa todo, así que la bandeja nunca queda incompleta y siempre hay "
           "un lugar donde mirar qué se le dijo al cliente."))

h.append(p("Si algo no anda", "h1"))
h.append(tabla([
    [p("Lo que ves", "cel_b"), p("Casi siempre es", "cel_b")],
    [p("Meta no acepta la URL del webhook.", "cel"),
     p("No redesplegaste Netlify después de cargar las variables, o el verify "
       "token no coincide.", "cel")],
    [p("El webhook quedó dado de alta pero no llega nada al Inbox.", "cel"),
     p("Falta suscribir el campo <font name='Mono' size='8.5'>messages</font>, o "
       "el WHATSAPP_APP_SECRET está mal y el CRM descarta por firma inválida.", "cel")],
    [p("Todo andaba y de golpe dejó de andar.", "cel"),
     p("Venció el token temporal de 24 horas.", "cel")],
    [p("n8n manda leads pero no aparecen.", "cel"),
     p("Falta CRM_API_KEYS, o la cabecera Authorization no lleva «Bearer ».", "cel")],
    [p("Error 131047 al mandar un mensaje.", "cel"),
     p("Pasaron más de 24 horas desde el último mensaje del cliente: sólo se "
       "puede mandar una plantilla aprobada.", "cel")],
], [72 * mm, 93 * mm]))

h.append(Spacer(1, 10))
h.append(p("Los pasos 5 y 6 necesitan trabajo sobre el CRM. Cuando llegues ahí, "
           "avisá y se construyen.", "pie"))


# ------------------------------------------------------------------ el armado
doc = BaseDocTemplate(RUTA, pagesize=A4,
                      leftMargin=22 * mm, rightMargin=22 * mm,
                      topMargin=20 * mm, bottomMargin=22 * mm,
                      title="Conectar WhatsApp API, n8n y el agente de IA",
                      author="CRM Les Arts Culinaires")
marco = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="cuerpo")
doc.addPageTemplates([PageTemplate(id="normal", frames=[marco], onPage=pie)])
doc.build(h)
print(f"listo: {RUTA}")
