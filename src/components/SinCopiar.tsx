"use client";

import { useEffect } from "react";

/**
 * Corta las salidas de datos que quedan cuando ya no se puede seleccionar.
 *
 * El CSS impide arrastrar el mouse sobre el contenido; esto se ocupa de las
 * otras tres puertas que quedan abiertas igual: Ctrl+C sobre una selección
 * hecha con el teclado, arrastrar un texto o una imagen fuera de la ventana, y
 * el menú del botón derecho, que ofrece «copiar» y «guardar imagen».
 *
 * HASTA DÓNDE LLEGA ESTO
 *
 * Sube el costo de llevarse datos sin querer o de apuro. No es una barrera:
 * una captura de pantalla, una foto con el celular, las herramientas de
 * desarrollo o imprimir a PDF siguen funcionando, y no hay forma de impedirlo
 * desde el navegador —para mostrar el dato hay que dárselo—. Lo que de verdad
 * limita una fuga es lo que ya hace la base: cada quien ve lo suyo, y todo
 * cambio queda anotado con nombre y hora.
 *
 * LO QUE SE DEJA PASAR, A PROPÓSITO
 *
 * Todo lo que pase dentro de un campo de texto. Sin esa excepción no se podría
 * corregir una nota con Ctrl+X, ni copiar el link de registro del cuadro que
 * aparece cuando el botón no logra copiarlo solo. Copiar el propio texto que
 * uno está escribiendo no es sacar información de ningún lado.
 *
 * `navigator.clipboard.writeText` no dispara el evento `copy`, así que el botón
 * de «Link de registro» sigue funcionando sin necesitar excepción.
 */
export function SinCopiar() {
  useEffect(() => {
    /** ¿El evento nace dentro de un campo donde se escribe? */
    const enUnCampo = (destino: EventTarget | null): boolean => {
      if (!(destino instanceof Element)) return false;
      return destino.closest("input, textarea, select, [contenteditable='true']") != null;
    };

    const frenar = (e: Event) => {
      if (enUnCampo(e.target)) return;
      e.preventDefault();
    };

    document.addEventListener("copy", frenar);
    document.addEventListener("cut", frenar);
    document.addEventListener("dragstart", frenar);
    document.addEventListener("contextmenu", frenar);

    return () => {
      document.removeEventListener("copy", frenar);
      document.removeEventListener("cut", frenar);
      document.removeEventListener("dragstart", frenar);
      document.removeEventListener("contextmenu", frenar);
    };
  }, []);

  return null;
}
