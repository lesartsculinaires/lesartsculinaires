begin;

-- Teléfono del asesor.
--
-- Hasta ahora `vendedores` guardaba nombre y correo. Para que una
-- automatización pueda avisarle a quien le toca un lead —un WhatsApp, un
-- mensaje del asistente— hace falta el número, y no estaba en ningún lado:
-- vivía en la cabeza de quien reparte los leads.
--
-- Sólo agrega una columna que puede quedar vacía. No cambia nada de lo que ya
-- funciona, así que se puede correr con gente trabajando.

alter table public.vendedores
  add column if not exists telefono text;

comment on column public.vendedores.telefono is
  'WhatsApp del asesor, en formato internacional (503XXXXXXXX). Lo usa la API '
  'para decirle a n8n a qué número avisar.';

-- El número se guarda tal como se escriba, pero al menos se comprueba que sean
-- dígitos y que tenga largo de teléfono. Sin esto, un "no tiene" escrito en la
-- casilla llegaría hasta el nodo de WhatsApp y fallaría allá, lejos de donde
-- se puede arreglar.
--
-- Se acepta `null` a propósito: pedir el número de todos para poder guardar
-- uno solo trabaría el alta de un asesor nuevo.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vendedores_telefono_valido'
  ) then
    alter table public.vendedores
      add constraint vendedores_telefono_valido
      check (telefono is null or telefono ~ '^[0-9]{8,15}$');
  end if;
end $$;

commit;
