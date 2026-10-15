-- El canal «Pagina Web», pedido por la escuela el 14 de octubre de 2026:
-- clientes que llegan desde el sitio. Aplicado en producción ese día (id 12).
-- Con el nombre tal como lo pidieron, sin tilde, como «Organico».
insert into public.canales (nombre)
select 'Pagina Web'
 where not exists (
   select 1 from public.canales where lower(nombre) in ('pagina web', 'página web')
 );
