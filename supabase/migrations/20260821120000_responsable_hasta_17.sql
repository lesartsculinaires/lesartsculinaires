begin;

-- El responsable se pide de 17 para abajo, no de 16.
--
-- La regla original era «menor de 17», o sea hasta 16. Se corrige a «menor de
-- 18», que es de 17 para abajo y además coincide con la mayoría de edad.
--
-- La pantalla ya aplica la regla nueva; esto pone de acuerdo a la base, que
-- tenía el corte escrito en dos lugares: el índice de menores sin responsable
-- y el comentario de la columna. Un índice parcial que se queda con el corte
-- viejo no da error, hace algo peor: la consulta que lo use deja de ver a los
-- de 17, y desde afuera parece que no falta nadie.
--
-- No toca datos. Se puede correr con gente trabajando.

drop index if exists public.ix_clientes_menores_sin_responsable;

create index if not exists ix_clientes_menores_sin_responsable
  on public.clientes (edad)
  where edad is not null and edad < 18 and responsable_nombre is null;

comment on column public.clientes.edad is
  'Edad declarada al inscribirse. De 17 para abajo el CRM pide los datos de un responsable.';

comment on column public.clientes.responsable_nombre is
  'Nombre y apellido del adulto responsable. Aplica a menores de 18, o sea de 17 para abajo.';

commit;
