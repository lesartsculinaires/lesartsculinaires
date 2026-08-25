"use client";

import type { CSSProperties } from "react";

import { signOut } from "@/app/actions";
import { IconoModulo } from "@/components/ui/IconoModulo";
import { getBrowserClient } from "@/lib/supabase/browser";
import { T, soft } from "@/lib/theme";

interface Props {
  accent: string;
  mod: string;
  userEmail: string;
  /**
   * Rol de quien entró: «Administrador», «Ventas»…
   *
   * Nulo cuando no se puede saber —faltan las tablas de roles— y entonces no
   * se dice nada, en vez de suponer uno. Antes acá había un «Ventas» escrito
   * a mano que salía igual para todos, así que un administrador leía que
   * estaba en modo ventas.
   */
  rol: string | null;
  /** Nombre de la persona, si su cuenta lo tiene cargado. */
  nombre: string | null;
  /**
   * Los módulos que esta persona ve, ya resueltos.
   *
   * Llega hecha y no se arma acá: quién ve qué sale de lo que dirección marcó
   * por rol, y eso lo sabe quien tiene los accesos cargados. La barra
   * solamente dibuja lo que le dan, que es su trabajo.
   */
  modulos: readonly string[];
  /**
   * Cuántas cosas sin atender tiene cada módulo: «Inbox» → 3.
   *
   * Va como un mapa y no como una propiedad suelta —`mensajesSinLeer`— porque
   * mañana Recordatorios va a querer el suyo, y con el mapa eso es una clave
   * más en quien lo arma, sin tocar nada de acá.
   */
  avisos?: Readonly<Record<string, number>>;
  onSelect: (mod: string) => void;
}

export function Sidebar({
  accent,
  mod,
  userEmail,
  rol,
  nombre,
  modulos,
  avisos = {},
  onSelect,
}: Props) {

  // Quién sos, con lo mejor que se sepa y sin repetir.
  const principal = rol ?? nombre ?? userEmail;
  const secundario =
    principal === userEmail ? null : rol && nombre ? `${nombre} · ${userEmail}` : userEmail;

  const navStyle = (label: string): CSSProperties => ({
    // De bloque a fila: el icono a la izquierda, el nombre al medio y el
    // número a la derecha, con el nombre ocupando lo que sobre para que todos
    // los números queden alineados en la misma columna.
    display: "flex",
    alignItems: "center",
    gap: 9,
    width: "100%",
    textAlign: "left",
    padding: "8px 10px",
    marginBottom: 2,
    borderRadius: 6,
    fontSize: 13,
    lineHeight: 1.3,
    background: mod === label ? soft(accent) : "transparent",
    color: mod === label ? accent : T.muted,
  });

  const cerrarSesion = async () => {
    // Limpieza local del token que supabase-js guarda en memoria. Va con
    // scope "local" a propósito: no necesita red, así que no puede fallar y
    // dejar el botón sin efecto. Revocar del lado del servidor es tarea de
    // la acción de abajo, que además borra la cookie y navega.
    try {
      await getBrowserClient().auth.signOut({ scope: "local" });
    } catch {
      // Que la limpieza local falle no puede impedir cerrar la sesión.
    }
    await signOut();
  };

  return (
    <aside
      style={{
        width: 230,
        flexShrink: 0,
        background: T.surface,
        borderRight: `1px solid ${T.border}`,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        /*
         * La barra se queda quieta mientras la pantalla se desplaza.
         *
         * Antes se iba para arriba con el resto: en Clientes, con seiscientas
         * filas, bajar un poco dejaba fuera de vista los módulos y el botón de
         * cerrar sesión, y para cambiar de pantalla —o para salir— había que
         * volver hasta arriba de todo.
         *
         * `alignSelf` en «flex-start» es lo que hace falta para que funcione y
         * es fácil de pasar por alto: el contenedor estira a sus hijos por
         * omisión, así que sin esto la barra mediría lo mismo que el contenido
         * —más alta que la ventana— y `sticky` no tendría contra qué pegarse.
         */
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
        height: "100vh",
      }}
    >
      <p
        className="mono"
        style={{
          margin: "0 0 14px",
          fontSize: 10,
          letterSpacing: "0.12em",
          color: T.faint,
          textTransform: "uppercase",
        }}
      >
        Les Arts Culinaires
      </p>

      <div
        style={{
          background: soft(accent),
          color: accent,
          borderRadius: 9,
          padding: "11px 12px",
        }}
      >
        <p
          className="mono"
          style={{
            margin: "0 0 3px",
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            opacity: 0.85,
          }}
        >
          Sesión activa
        </p>
        {/* Arriba el rol, porque es lo que dice qué se puede hacer. Si no se
            sabe, manda el nombre; y si tampoco, el correo. Nunca un valor
            inventado. */}
        <p className="dsp" style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
          {principal}
        </p>
        {/* Y abajo el correo, salvo que ya sea lo de arriba: repetirlo dos
            veces se ve a error. */}
        {secundario && (
          <p
            className="mono"
            style={{
              margin: "2px 0 0",
              fontSize: 10,
              opacity: 0.8,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {secundario}
          </p>
        )}
      </div>

      <p
        className="mono"
        style={{
          margin: "18px 0 6px",
          fontSize: 10,
          letterSpacing: "0.1em",
          color: T.faint,
          textTransform: "uppercase",
        }}
      >
        Módulos
      </p>
      {/*
        Si los módulos no entran —una laptop de pantalla baja, o el navegador
        con mucho zoom— se desplaza esta lista y no la barra entera. Así
        «Cerrar sesión» queda abajo pase lo que pase, que es justamente lo que
        se busca. `minHeight: 0` hace falta porque un hijo de flex no se deja
        achicar por debajo de su contenido sin eso, y la lista desbordaría en
        vez de desplazarse.
      */}
      <nav style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {modulos.map((m) => {
          const puesto = mod === m;
          const cuantos = avisos[m] ?? 0;

          return (
            <button
              type="button"
              key={m}
              className="nav"
              // Una marca estable para poder señalar este botón. El texto ya
              // no alcanza: con el icono y el número al lado, el contenido del
              // botón es «Inbox4» y cualquier búsqueda por texto exacto falla.
              data-mod={m}
              onClick={() => onSelect(m)}
              // El número también en el rótulo hablado: quien navega con
              // lector de pantalla no ve el globito rojo.
              aria-label={cuantos > 0 ? `${m}, ${cuantos} sin leer` : undefined}
              style={navStyle(m)}
            >
              <IconoModulo nombre={m} color={puesto ? accent : T.faint} />
              <span style={{ flex: 1, minWidth: 0 }}>{m}</span>
              {cuantos > 0 && (
                <span
                  style={{
                    flexShrink: 0,
                    minWidth: 18,
                    height: 18,
                    padding: "0 5px",
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 9,
                    // El mismo rojo de la campana de la cabecera: dos avisos
                    // de «hay algo sin atender» de distinto color se leen como
                    // dos cosas distintas.
                    background: "#B85042",
                    color: "#fff",
                    fontSize: 10.5,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {cuantos > 99 ? "99+" : cuantos}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div
        style={{
          borderTop: `1px solid ${T.border}`,
          marginTop: 16,
          paddingTop: 12,
        }}
      >
        <button
          type="button"
          onClick={cerrarSesion}
          style={{
            textAlign: "left",
            padding: "8px 10px",
            fontSize: 13,
            color: T.faint,
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
