"use client";

/**
 * «Guía»: la hoja de instrucciones de la plantilla, dicha para el CRM. Lo que
 * cambia respecto del Excel: ya no hay archivo que se pasa de mano en mano,
 * y lo que el CRM ya sabe no se escribe.
 */

import { T } from "@/lib/theme";
import { Ancha, Titulo, tabla, td, th } from "@/components/modules/tablero/comun";

const QUIEN = [
  ["Director de Marketing", "Pauta por canal, alcance, seguidores, publicaciones, visitas a colegios, clases muestra y reseñas de Google. Los leads por canal los pone el CRM; sólo se corrigen si hace falta.", "MK semanal", "Lunes antes de las 12:00"],
  ["Gerente de Ventas", "Cotizaciones y contratos corporativos, venta nueva en dinero (alumnos nuevos, cursos cortos, corporativo) y descuentos. Contactados, citas, inscritos por canal y cursos cortos los pone el CRM.", "Ventas semanal", "Lunes antes de las 12:00"],
  ["Director de MK y Gerente de Ventas", "Plan de acciones: cada acción antes de hacerla (qué, cuándo, costo, leads esperados) y después con lo que dio (leads, inscritos, venta). MK debe tener acciones sin pauta todas las semanas.", "Plan de acciones", "Al planificar y 7 días después de cada acción"],
  ["Vendedoras y Gerente", "Actividad de la semana por persona. Mensajes, citas y cierres los pone el CRM; se completan llamadas, recontactos, salidas de campo y eventos.", "Actividad de ventas", "Lunes antes de las 12:00"],
  ["Gerente de Ventas (cierre)", "Lo que vendió cada persona en el mes (cantidades y montos). Sin comisiones: Dirección las calcula aparte.", "Ventas por persona", "Primer lunes del mes siguiente"],
  ["Gerente de Ventas (lunes)", "Reservas e inscritos de cada grupo que está en venta. El Tablero avisa qué grupos están en riesgo de no abrir.", "Grupos en venta", "Lunes antes de las 12:00"],
  ["Dirección General", "Define las metas. MK y Ventas llenan todo lo demás. Revisa el Tablero y deja su comentario.", "Metas · Tablero", "Al inicio de cada mes"],
];

const DATOS = [
  ["Pauta por canal $", "Lo invertido en anuncios esa semana, por plataforma. «Otros» = influencers, impresos, activaciones.", "Administrador de anuncios de cada plataforma", "MK"],
  ["Alcance", "Personas únicas alcanzadas en la semana, sumando todas las redes de esa marca.", "Meta Business Suite / TikTok", "MK"],
  ["Lead", "Persona que dejó sus datos o escribió preguntando por un programa o servicio. No cuenta un «me gusta» ni un comentario sin consulta.", "CRM: cada oportunidad nueva, según su canal. Los importados de una base no cuentan como lead nuevo.", "CRM (MK corrige)"],
  ["Calificación Google", "La estrella que muestra el perfil de Google el domingo.", "Perfil de Google de la empresa", "MK"],
  ["Contactados en menos de 24 h", "Leads de la semana a los que Ventas respondió antes de 24 horas desde que llegaron.", "CRM: primer mensaje, nota o llamada después de que llegó el lead", "CRM (Ventas corrige)"],
  ["Inscritos por canal", "Alumnos nuevos de diplomado que se inscribieron esa semana, según el canal por el que llegaron.", "CRM: oportunidades ganadas, con su canal", "CRM (Ventas corrige)"],
  ["Venta nueva $", "Lo cobrado a alumnos nuevos (matrícula + 1ª cuota) + cursos cortos + corporativo, ya con descuentos. NO incluye mensualidades de alumnos que ya estaban.", "Cobros, contratos y fichas de inscripción. El CRM muestra en gris lo que tiene como ayuda.", "Ventas"],
  ["Descuentos y becas $", "Cuánto se dejó de cobrar en esas ventas por promociones, descuentos o becas.", "Fichas de inscripción", "Ventas"],
];

const parrafo = { margin: "0 0 8px", fontSize: 13, color: T.ink, lineHeight: 1.55 } as const;

export function HojaGuia() {
  return (
    <div style={{ maxWidth: 980 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, color: T.ink }}>Tablero Comercial — Guía de uso</h2>
      <p style={{ ...parrafo, color: T.muted }}>
        Lo llenan el Director de Marketing y la Gerente de Ventas, cada quien su parte, directamente en el CRM. La Dirección
        General lo revisa cada lunes. Ya no hay archivo que pasar: lo que se escribe aparece al momento para todos los que
        tienen acceso.
      </p>

      <Titulo>Quién llena qué</Titulo>
      <Ancha>
        <table style={tabla}>
          <thead><tr>{["Persona", "Qué llena", "Hoja", "Cuándo"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {QUIEN.map(([a, b, c, d]) => (
              <tr key={a}>
                <td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap" }}>{a}</td>
                <td style={td}>{b}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{c}</td>
                <td style={{ ...td, color: T.muted }}>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Ancha>

      <Titulo>La meta en dinero</Titulo>
      <p style={parrafo}>
        Cada instituto tiene una META DE VENTA NUEVA en dinero para cada mes: lo que hay que vender aparte de lo que ya entra
        por mensualidades. La define la Dirección General.
      </p>
      <p style={parrafo}>
        Es una sola meta para los dos: MK trae los leads y Ventas los convierte. El número de inscritos se registra para medir
        conversión y llenar los grupos, pero la meta es en dinero.
      </p>

      <Titulo>Cómo se conectan los dos registros</Titulo>
      <ol style={{ ...parrafo, paddingLeft: 20 }}>
        <li>Los leads de cada semana, por canal, los cuenta el CRM: cada oportunidad nueva según su canal. Hay tres canales con pauta (Meta, TikTok, Google) y seis sin pauta. El Tablero mide qué % de los leads viene de canales sin pauta, para no depender solo de los anuncios.</li>
        <li>Esos leads aparecen solos en la hoja de Ventas, en la columna «Leads que entregó MK». Ventas no los vuelve a escribir: el CRM cuenta cuántos se contactaron, cuántos en menos de 24 horas y cuántos se inscribieron.</li>
        <li>Los inscritos se cuentan según el canal por el que llegó el alumno. Con eso el Tablero cruza leads contra inscritos y muestra qué canal sí convierte en matrícula.</li>
        <li>Hay tres KPIs compartidos, que solo se pueden calcular con los dos registros: conversión lead → inscrito, costo de pauta por inscrito y retorno de la pauta. Si una de las dos partes no se llena, esos KPIs quedan vacíos.</li>
        <li>El cuadre MK ↔ Ventas del Tablero avisa si hay leads sin contactar (inversión de MK que se pierde) o si Ventas reporta más contactos que leads.</li>
      </ol>

      <Titulo>Qué significa cada dato</Titulo>
      <Ancha>
        <table style={tabla}>
          <thead><tr>{["Dato", "Qué es exactamente", "De dónde sale", "Quién"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {DATOS.map(([a, b, c, d]) => (
              <tr key={a}>
                <td style={{ ...td, fontWeight: 600 }}>{a}</td>
                <td style={td}>{b}</td>
                <td style={{ ...td, color: T.muted }}>{c}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Ancha>

      <Titulo>Reglas para llenar</Titulo>
      <ul style={{ ...parrafo, paddingLeft: 20 }}>
        <li>Semana = lunes a domingo. Una semana que empieza en un mes y termina en el siguiente se suma al mes donde cae el jueves.</li>
        <li>Si algo fue cero, escriba 0. Deje la celda vacía solo si todavía no se ha cargado esa semana: el Tablero sabe cuántas semanas van cargadas y prorratea las metas.</li>
        <li>Lo que trae el CRM se ve en gris dentro de la celda. No hace falta escribirlo. Si el número del CRM está mal (por ejemplo, un lead que llegó por teléfono y no quedó registrado), se escribe el correcto encima y la celda queda marcada como corregida.</li>
        <li>Solo se pueden escribir las celdas que le tocan a cada quien; el resto se ve pero no se edita. Cada guardado queda con el nombre de quien lo hizo.</li>
        <li>Cada hoja tiene un espacio de comentario del mes: qué explica los números, qué se hará distinto, qué hace falta.</li>
      </ul>

      <Titulo>Cómo se lee el Tablero</Titulo>
      <ul style={{ ...parrafo, paddingLeft: 20 }}>
        <li><b>Índice de cumplimiento:</b> % de los KPIs con meta y con datos que llegaron a su meta. Es la nota del mes. Se ve general y por responsable (Director de MK, Gerente de Ventas y compartidos).</li>
        <li><b>Semáforo de cada KPI:</b> Cumple = llegó a la meta · Cerca = a menos de 10% · No cumple = más de 10% lejos · Sin meta = falta definirla en «Metas».</li>
        <li><b>Evolución</b> muestra todos los KPIs mes por mes en colores, para ver qué mejora y qué no. Con «Mes a revisar» se cambia el mes y se compara con cualquier mes anterior.</li>
      </ul>
    </div>
  );
}
