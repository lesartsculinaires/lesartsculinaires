"use client";

import { useState } from "react";

import {
  crearFormulario,
  editarFormulario,
  guardarCampos,
  type CampoParaGuardar,
} from "@/app/formularios-actions";
import { useCatalogo } from "@/lib/catalog";
import type { Formulario, Mapeo, TipoCampo } from "@/lib/formularios";
import { T } from "@/lib/theme";

/**
 * El constructor: armar el formulario de una feria.
 *
 * Es de administración y se usa una vez por feria, así que se optimiza para
 * que quede bien y no para que se arme rápido. De ahí que cada pregunta muestre
 * a la vista sus tres decisiones —qué tipo es, si es obligatoria y a qué campo
 * del lead va— en vez de esconderlas en un menú.
 *
 * LA DECISIÓN QUE MÁS SE OLVIDA
 *
 * «A qué campo va». Un formulario donde ninguna pregunta es el nombre no puede
 * crear una ficha, y eso recién se descubriría en la feria con la persona
 * enfrente. Por eso se avisa acá, y el guardado lo rechaza.
 */

/** Los tipos de pregunta, con el nombre que tienen para quien arma. */
const TIPOS: { valor: TipoCampo; nombre: string }[] = [
  { valor: "texto", nombre: "Texto corto" },
  { valor: "parrafo", nombre: "Texto largo" },
  { valor: "telefono", nombre: "Teléfono" },
  { valor: "correo", nombre: "Correo" },
  { valor: "numero", nombre: "Número" },
  { valor: "opcion", nombre: "Elegir una" },
  { valor: "opciones", nombre: "Elegir varias" },
];

/** A qué campo del lead puede ir una respuesta. */
const MAPEOS: { valor: Mapeo | ""; nombre: string }[] = [
  { valor: "", nombre: "Sólo a la nota" },
  { valor: "nombre", nombre: "Nombre del lead" },
  { valor: "telefono", nombre: "Teléfono" },
  { valor: "correo", nombre: "Correo" },
  { valor: "edad", nombre: "Edad" },
  { valor: "responsable_nombre", nombre: "Nombre del responsable" },
  { valor: "responsable_telefono", nombre: "Teléfono del responsable" },
  { valor: "responsable_correo", nombre: "Correo del responsable" },
  { valor: "producto_id", nombre: "Programa de interés" },
  { valor: "territorio_id", nombre: "Territorio" },
];

interface Borrador extends CampoParaGuardar {
  /** Clave sólo del navegador, para poder reordenar sin ids de base. */
  clave: string;
}

let contador = 0;
const nuevaClave = () => `c${++contador}`;

const vacio = (): Borrador => ({
  clave: nuevaClave(),
  etiqueta: "",
  ayuda: null,
  tipo: "texto",
  requerido: false,
  opciones: [],
  mapeaA: null,
});

export function ArmarFormulario({
  formulario,
  accent,
  onCerrar,
  onGuardado,
}: {
  /** Null para uno nuevo. */
  formulario: Formulario | null;
  accent: string;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const cat = useCatalogo();

  const [nombre, setNombre] = useState(formulario?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(formulario?.descripcion ?? "");
  const [canalId, setCanalId] = useState<number | null>(formulario?.canalId ?? null);
  const [etapaId, setEtapaId] = useState<number | null>(formulario?.etapaId ?? null);
  const [estadoId, setEstadoId] = useState<number | null>(formulario?.estadoId ?? null);
  const [territorioId, setTerritorioId] = useState<number | null>(formulario?.territorioId ?? null);

  const [campos, setCampos] = useState<Borrador[]>(
    formulario?.campos.length
      ? formulario.campos.map((c) => ({
          clave: nuevaClave(),
          etiqueta: c.etiqueta,
          ayuda: c.ayuda,
          tipo: c.tipo,
          requerido: c.requerido,
          opciones: c.opciones,
          mapeaA: c.mapeaA,
        }))
      : [vacio()],
  );

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cambiar = (clave: string, patch: Partial<Borrador>) =>
    setCampos((cs) => cs.map((c) => (c.clave === clave ? { ...c, ...patch } : c)));

  const mover = (i: number, hacia: -1 | 1) =>
    setCampos((cs) => {
      const j = i + hacia;
      if (j < 0 || j >= cs.length) return cs;
      const copia = [...cs];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });

  const sinNombre = !campos.some((c) => c.mapeaA === "nombre" && c.etiqueta.trim() !== "");

  const guardar = async () => {
    setGuardando(true);
    setError(null);

    const datos = {
      nombre,
      descripcion: descripcion.trim() || null,
      canalId,
      etapaId,
      estadoId,
      territorioId,
    };

    const r = formulario
      ? await editarFormulario(formulario.id, datos)
      : await crearFormulario(datos);

    if (!r.ok) {
      setGuardando(false);
      setError(r.error);
      return;
    }

    const id = formulario?.id ?? r.id;
    if (id == null) {
      setGuardando(false);
      setError("Se guardó el formulario pero no se pudo saber su id para las preguntas.");
      return;
    }

    const rc = await guardarCampos(
      id,
      campos.map(({ clave: _clave, ...c }) => c),
    );
    setGuardando(false);

    if (!rc.ok) {
      setError(rc.error);
      return;
    }
    onGuardado();
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ ...CAJA, borderTop: `6px solid ${accent}`, marginBottom: 12 }}>
        <label style={ETIQUETA}>Nombre del formulario</label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Feria Colegio Externado — marzo"
          autoFocus
          style={{ ...CAMPO, fontSize: 16, fontWeight: 600 }}
        />

        <label style={{ ...ETIQUETA, marginTop: 12 }}>
          Descripción <span style={{ textTransform: "none" }}>— se lee arriba de todo</span>
        </label>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={2}
          style={{ ...CAMPO, height: "auto", padding: "8px 10px", resize: "vertical" }}
        />

        {/*
          Con qué nace el lead.

          Son los datos que en una feria son iguales para los doscientos que
          pasen por el stand. Poniéndolos acá una sola vez, el asesor no los
          tipea nunca y ningún lead queda sin canal —que es lo que después
          permite saber cuántos dejó cada feria—.
        */}
        <p style={{ ...ETIQUETA, marginTop: 14, marginBottom: 7 }}>
          Los leads de este formulario entran así
        </p>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <Elegir rotulo="Canal" items={cat.canales} valor={canalId} onPick={setCanalId} />
          <Elegir rotulo="Etapa" items={cat.etapas} valor={etapaId} onPick={setEtapaId} />
          <Elegir rotulo="Estado" items={cat.estados} valor={estadoId} onPick={setEstadoId} />
          <Elegir
            rotulo="Territorio"
            items={cat.territorios}
            valor={territorioId}
            onPick={setTerritorioId}
          />
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 11.5, color: T.faint, lineHeight: 1.5 }}>
          El vendedor no se elige acá: cada lead queda asignado a quien llenó el
          formulario.
        </p>
      </div>

      {campos.map((campo, i) => (
        <Pregunta
          key={campo.clave}
          campo={campo}
          indice={i}
          total={campos.length}
          accent={accent}
          programas={cat.productos}
          territorios={cat.territorios}
          onCambiar={(patch) => cambiar(campo.clave, patch)}
          onMover={(hacia) => mover(i, hacia)}
          onBorrar={() => setCampos((cs) => cs.filter((c) => c.clave !== campo.clave))}
        />
      ))}

      <button
        type="button"
        onClick={() => setCampos((cs) => [...cs, vacio()])}
        style={{ ...BOTON, marginBottom: 14 }}
      >
        Agregar pregunta
      </button>

      {sinNombre && (
        <p
          style={{
            margin: "0 0 12px",
            padding: "10px 12px",
            fontSize: 12.5,
            lineHeight: 1.5,
            borderRadius: 8,
            background: "#F6EEDC",
            color: "#7A5A12",
          }}
        >
          Ninguna pregunta está marcada como <strong>Nombre del lead</strong>. Sin eso no
          se puede crear la ficha del cliente, y el formulario no se va a poder llenar.
        </p>
      )}

      {error && (
        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: T.warn, lineHeight: 1.45 }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardando || !nombre.trim()}
          style={{
            ...BOTON,
            height: 38,
            padding: "0 18px",
            fontWeight: 600,
            background: nombre.trim() ? accent : T.border,
            color: nombre.trim() ? "#fff" : T.faint,
            border: "none",
            cursor: guardando ? "wait" : nombre.trim() ? "pointer" : "not-allowed",
          }}
        >
          {guardando ? "Guardando…" : formulario ? "Guardar cambios" : "Crear el formulario"}
        </button>
        <button type="button" onClick={onCerrar} disabled={guardando} style={BOTON}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Pregunta({
  campo,
  indice,
  total,
  accent,
  programas,
  territorios,
  onCambiar,
  onMover,
  onBorrar,
}: {
  campo: Borrador;
  indice: number;
  total: number;
  accent: string;
  programas: readonly { id: number; nombre: string }[];
  territorios: readonly { id: number; nombre: string }[];
  onCambiar: (patch: Partial<Borrador>) => void;
  onMover: (hacia: -1 | 1) => void;
  onBorrar: () => void;
}) {
  const conOpciones = campo.tipo === "opcion" || campo.tipo === "opciones";

  /**
   * El catálogo al que se enlazan las opciones, si la pregunta alimenta uno.
   *
   * Cuando la respuesta va al programa, cada opción puede llevar el id del
   * programa que le corresponde: así en la feria se pregunta «Pastelería
   * Internacional» y el lead cae igual en el Diplomado de Pastelería. Sin ese
   * enlace, la respuesta sería una cadena suelta que no aparece en Programas
   * ni en el Dashboard.
   */
  const catalogo =
    campo.mapeaA === "producto_id" ? programas : campo.mapeaA === "territorio_id" ? territorios : null;

  return (
    <div style={{ ...CAJA, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span className="mono" style={{ fontSize: 11, color: T.faint, paddingTop: 10 }}>
          {indice + 1}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            value={campo.etiqueta}
            onChange={(e) => onCambiar({ etiqueta: e.target.value })}
            placeholder="La pregunta, tal cual se la va a leer"
            style={{ ...CAMPO, fontSize: 14.5 }}
          />
          <input
            value={campo.ayuda ?? ""}
            onChange={(e) => onCambiar({ ayuda: e.target.value || null })}
            placeholder="Aclaración, si hace falta"
            style={{ ...CAMPO, marginTop: 6, fontSize: 12.5, height: 32 }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <button
            type="button"
            onClick={() => onMover(-1)}
            disabled={indice === 0}
            aria-label="Subir"
            style={{ ...MINI, color: indice === 0 ? T.border : T.muted }}
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => onMover(1)}
            disabled={indice === total - 1}
            aria-label="Bajar"
            style={{ ...MINI, color: indice === total - 1 ? T.border : T.muted }}
          >
            ▼
          </button>
          <button type="button" onClick={onBorrar} aria-label="Borrar" style={{ ...MINI, color: T.warn }}>
            ✕
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 11 }}>
        <select
          value={campo.tipo}
          onChange={(e) => onCambiar({ tipo: e.target.value })}
          style={SELECT}
        >
          {TIPOS.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.nombre}
            </option>
          ))}
        </select>

        <select
          value={campo.mapeaA ?? ""}
          onChange={(e) => onCambiar({ mapeaA: e.target.value || null })}
          title="A qué campo del lead va esta respuesta"
          style={SELECT}
        >
          {MAPEOS.map((m) => (
            <option key={m.valor} value={m.valor}>
              {m.nombre}
            </option>
          ))}
        </select>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: T.ink }}>
          <input
            type="checkbox"
            checked={campo.requerido}
            onChange={(e) => onCambiar({ requerido: e.target.checked })}
          />
          Obligatoria
        </label>
      </div>

      {conOpciones && (
        <div style={{ marginTop: 11 }}>
          <p style={{ ...ETIQUETA, marginBottom: 6 }}>Opciones</p>
          {campo.opciones.map((o, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 5 }}>
              <input
                value={o.texto}
                onChange={(e) => {
                  const copia = [...campo.opciones];
                  copia[i] = { ...copia[i], texto: e.target.value };
                  onCambiar({ opciones: copia });
                }}
                placeholder="Lo que lee la persona"
                style={{ ...CAMPO, height: 32, fontSize: 12.5 }}
              />
              {catalogo && (
                <select
                  value={o.valor ?? ""}
                  onChange={(e) => {
                    const copia = [...campo.opciones];
                    copia[i] = { ...copia[i], valor: e.target.value ? Number(e.target.value) : null };
                    onCambiar({ opciones: copia });
                  }}
                  title="Con qué se corresponde en el catálogo"
                  style={{ ...SELECT, maxWidth: 230 }}
                >
                  <option value="">— sin enlazar —</option>
                  {catalogo.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => onCambiar({ opciones: campo.opciones.filter((_, j) => j !== i) })}
                aria-label="Quitar opción"
                style={{ ...MINI, color: T.warn }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onCambiar({ opciones: [...campo.opciones, { texto: "", valor: null }] })}
            style={{ ...BOTON, height: 28, fontSize: 12, color: accent }}
          >
            Agregar opción
          </button>
        </div>
      )}
    </div>
  );
}

function Elegir({
  rotulo,
  items,
  valor,
  onPick,
}: {
  rotulo: string;
  items: readonly { id: number; nombre: string }[];
  valor: number | null;
  onPick: (v: number | null) => void;
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ ...ETIQUETA, marginBottom: 3 }}>{rotulo}</span>
      <select
        value={valor ?? ""}
        onChange={(e) => onPick(e.target.value ? Number(e.target.value) : null)}
        style={{ ...SELECT, width: "100%" }}
      >
        <option value="">— sin poner —</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}

const CAJA: React.CSSProperties = {
  padding: "16px 18px",
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 10,
};

const CAMPO: React.CSSProperties = {
  width: "100%",
  height: 36,
  padding: "0 10px",
  fontSize: 13.5,
  border: `1px solid ${T.border}`,
  borderRadius: 7,
  background: T.surface,
  color: T.ink,
};

const SELECT: React.CSSProperties = {
  height: 32,
  padding: "0 8px",
  fontSize: 12.5,
  border: `1px solid ${T.border}`,
  borderRadius: 7,
  background: T.surface,
  color: T.ink,
};

const ETIQUETA: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  fontSize: 10.5,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: T.faint,
};

const BOTON: React.CSSProperties = {
  height: 34,
  padding: "0 14px",
  fontSize: 12.5,
  borderRadius: 8,
  border: `1px solid ${T.border}`,
  background: T.surface,
  color: T.ink,
  cursor: "pointer",
};

const MINI: React.CSSProperties = {
  width: 24,
  height: 22,
  fontSize: 11,
  lineHeight: 1,
  borderRadius: 5,
  background: "transparent",
  cursor: "pointer",
};
