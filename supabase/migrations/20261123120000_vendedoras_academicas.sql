-- La sección «Académico» del Inbox (pedido del 28/10/2026).
--
-- Sussy, del área académica, sube bases y les manda masivos; las respuestas
-- quedan a su nombre («Las atiendo yo»). La escuela pidió verlas en una sección
-- propia del Inbox, junto a los canales, en vez de clasificar bases —que es
-- ambiguo—. Lo que define la sección es la persona: los chats asignados a una
-- ficha marcada como académica.
--
-- No esconde nada a nadie: es una forma más de recortar la lista, como los
-- canales. Sin la columna, la sección no aparece y el resto anda igual.

alter table public.vendedores
  add column if not exists academico boolean not null default false;

comment on column public.vendedores.academico is
  'Del área académica: sus chats se ven en la sección «Académico» del Inbox.';
