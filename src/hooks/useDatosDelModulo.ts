"use client";

import { useEffect, useRef, useState } from "react";

import { cargarConjuntos } from "@/app/modulo-actions";
import { queFalta, type Conjunto } from "@/lib/datosDelModulo";
import type { DatosPerezosos } from "@/lib/datosPerezosos";

/**
 * Tener en la mano lo que la pantalla abierta necesita, y nada más.
 *
 * ============================================================================
 * CÓMO SE REPARTE EL TRABAJO CON EL SERVIDOR
 * ============================================================================
 *
 * El servidor ya manda, en cada dibujado, los conjuntos de la pantalla que
 * sabe que se está viendo —lo sabe por la galleta del último módulo—. O sea
 * que en el caso normal esto NO PIDE NADA: lo que llegó ya alcanza, y la
 * pantalla se pinta entera del servidor como siempre.
 *
 * Este enganche es para los dos casos en que no alcanza:
 *
 *   SE CAMBIÓ DE PANTALLA   La barra lateral cambia de módulo sin ir al
 *                           servidor. Si la nueva necesita algo que no vino,
 *                           se pide acá.
 *
 *   EL SERVIDOR SE ADELANTÓ Entre que se cambia de pantalla y que se guarda la
 *                           galleta puede caer un refresco con la pantalla
 *                           vieja. Vino lo que no hace falta y falta lo que
 *                           sí: se pide la diferencia.
 *
 * ============================================================================
 * CUÁNDO SE CONSIDERA VIEJO LO QUE YA SE TIENE
 * ============================================================================
 *
 * Cuando el servidor volvió a dibujar, que es lo que marca `sello`. Ahí todo
 * lo guardado queda viejo de golpe —pudo cambiar cualquier cosa— y se vuelve a
 * pedir, pero SÓLO lo que la pantalla abierta necesita ahora. Lo que se tenía
 * de otra pantalla se tira: si se vuelve a ella se pide de nuevo y llega
 * fresco, que es mejor que mostrar algo de hace diez minutos.
 *
 * Es la misma idea que el resto del CRM —`router.refresh()` vuelve a pedir lo
 * que se está mirando—, extendida a lo que ya no viaja en cada dibujado.
 */
export function useDatosDelModulo(
  /** Lo que la pantalla abierta necesita. Ver `queSeNecesita`. */
  necesarios: readonly Conjunto[],
  /** Lo que el servidor mandó en este dibujado. */
  delServidor: DatosPerezosos,
  /** Qué conjuntos trae `delServidor`, aunque hayan venido vacíos. */
  servidos: readonly Conjunto[],
  /**
   * Cambia cuando el servidor volvió a dibujar.
   *
   * No se mira el contenido sino la identidad: alcanza cualquier cosa que el
   * servidor arme de nuevo cada vez. La portada pasa el arreglo de
   * oportunidades, que es lo que ya se usaba para el «Actualizado hace…».
   */
  sello: unknown,
): {
  /** Lo que haya, mezclado. Un campo que falta es un campo que no llegó. */
  datos: DatosPerezosos;
  /** Qué se está esperando ahora mismo, para poder decirlo en pantalla. */
  cargando: Conjunto[];
  /** Si el último pedido falló. Null mientras todo vaya bien. */
  error: string | null;
} {
  /*
   * Lo pedido por el navegador vive en una caja y no en el estado.
   *
   * Porque hay que poder mirarlo en el mismo instante en que se decide qué
   * falta. Con estado, dos cambios de pantalla seguidos deciden los dos sobre
   * la foto vieja y piden dos veces lo mismo. El redibujado se fuerza aparte,
   * cuando llega lo pedido, que es cuando hay algo nuevo que mostrar.
   */
  const traidos = useRef<DatosPerezosos>({});
  const [, redibujar] = useState(0);

  const [cargando, setCargando] = useState<Conjunto[]>([]);
  const [error, setError] = useState<string | null>(null);

  /** El último dibujado del servidor que vimos, para saber qué quedó viejo. */
  const selloVisto = useRef(sello);
  /** Lo que se está pidiendo ahora, para no pedir dos veces lo mismo. */
  const enVuelo = useRef<string | null>(null);

  /*
   * Las listas como texto, para poder compararlas.
   *
   * `necesarios` es un arreglo nuevo en cada dibujado aunque diga lo mismo, y
   * usarlo de dependencia dispararía el efecto sin parar. Viene ordenado desde
   * `queSeNecesita` justamente para que esto funcione.
   */
  const clave = necesarios.join(",");
  const servidosClave = servidos.join(",");

  useEffect(() => {
    let vivo = true;

    if (selloVisto.current !== sello) {
      selloVisto.current = sello;
      traidos.current = {};
    }

    const yaEstan = [
      ...(Object.keys(traidos.current) as Conjunto[]),
      ...(servidosClave ? (servidosClave.split(",") as Conjunto[]) : []),
    ];
    const falta = queFalta(clave ? (clave.split(",") as Conjunto[]) : [], yaEstan);

    if (falta.length === 0) {
      enVuelo.current = null;
      setCargando([]);
      return;
    }

    // Ya se está pidiendo exactamente esto: dejarlo llegar.
    const pedido = falta.join(",");
    if (enVuelo.current === pedido) return;
    enVuelo.current = pedido;

    setCargando(falta);

    void (async () => {
      const r = await cargarConjuntos(falta);
      if (!vivo || enVuelo.current !== pedido) return;

      enVuelo.current = null;
      setError(r.error);
      if (!r.error) traidos.current = { ...traidos.current, ...r.datos };
      setCargando([]);
      redibujar((n) => n + 1);
    })();

    return () => {
      vivo = false;
    };
  }, [clave, servidosClave, sello]);

  /*
   * Lo del servidor pisa a lo traído a mano, y no al revés.
   *
   * Cuando los dos tienen el mismo conjunto es porque el servidor acaba de
   * dibujar con él: lo suyo es más nuevo por definición.
   */
  return { datos: { ...traidos.current, ...delServidor }, cargando, error };
}
