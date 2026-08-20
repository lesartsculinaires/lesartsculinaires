begin;

-- Poder abrir un chat desde el CRM.
--
-- EL HUECO QUE TAPA
--
-- `conversaciones` tenía política para leer y para editar, pero ninguna para
-- insertar. No era un olvido: hasta ahora las conversaciones nacían siempre de
-- un mensaje entrante, y eso lo escribe el webhook con la llave de servicio,
-- que se saltea RLS por definición. Nadie había necesitado crear una desde una
-- sesión de navegador.
--
-- Con el botón «Nuevo chat» sí hace falta: es el asesor quien decide empezar la
-- conversación, y su sesión sí pasa por RLS.
--
-- POR QUÉ ALCANZA CON PEDIR SESIÓN
--
-- Una fila de `conversaciones` es un hilo vacío: un teléfono y a quién apunta.
-- No manda nada ni le llega a nadie —mandar es `mensajes`, que ya tiene su
-- propia política y exige que el saliente quede a nombre de quien lo mandó—.
-- Y cualquiera del equipo ya puede leer y editar todas las conversaciones, así
-- que dejar crear una no abre nada que no estuviera abierto.
--
-- Lo que sí protege la tabla es su restricción de unicidad sobre el teléfono:
-- dos personas abriendo el chat del mismo número a la vez no crean dos hilos.

drop policy if exists conversaciones_abrir on public.conversaciones;
create policy conversaciones_abrir on public.conversaciones
  for insert to authenticated with check (true);

commit;
