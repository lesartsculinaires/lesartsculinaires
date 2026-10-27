-- Volumen parecido al de producción (27/10/2026): 3.000 leads, 1.000 chats, 9.000 mensajes.
-- Para medir y probar con carga: `medir-fluidez.mjs` y `prueba-listas-por-tandas.mjs`.
-- Se borra solo con las cuatro primeras sentencias (todo lo suyo lleva VOL- / vol- / @volumen.test).
delete from mensajes where conversacion_id in (select id from conversaciones where identificador like 'vol-%');
delete from conversaciones where identificador like 'vol-%';
delete from oportunidades where codigo like 'VOL-%';
delete from clientes where correo like '%@volumen.test';

insert into clientes (nombre, telefono, correo)
select 'Volumen ' || g || ' ' || (array['Ana','Luis','María','José','Carla','Pedro'])[1 + g % 6] || ' ' || (array['López','Pérez','Ramírez','Hernández'])[1 + g % 4],
       '7' || lpad(g::text, 7, '0'), 'vol' || g || '@volumen.test'
from generate_series(1, 3000) g;

insert into oportunidades (codigo, cliente_id, vendedor_id, producto_id, etapa_id, estado_id, fecha_registro, valor_oportunidad)
select 'VOL-' || lpad(row_number() over (order by c.id)::text, 5, '0'), c.id,
       (array[901, 902, null]::bigint[])[1 + (c.id % 3)::int],
       (select id from productos order by id limit 1 offset (c.id % 10)),
       (select id from etapas order by orden limit 1 offset (c.id % 5)),
       null,
       current_date - (c.id % 120)::int,
       (array[150, 430, 495, 1200])[1 + (c.id % 4)::int]
from clientes c where c.correo like '%@volumen.test';

insert into conversaciones (identificador, telefono, canal, cliente_id, vendedor_id, ultimo_mensaje_en, ultimo_texto, sin_leer)
select 'vol-' || c.id, '503' || c.telefono, 'whatsapp', c.id, (array[901, 902, null]::bigint[])[1 + (c.id % 3)::int],
       now() - ((c.id % 2000) || ' minutes')::interval, 'Hola, quiero información del diplomado', (c.id % 7 = 0)::int
from clientes c where c.correo like '%@volumen.test' and c.id % 3 = 0;

insert into mensajes (conversacion_id, direccion, tipo, texto, creado_en, estado)
select cv.id, case when n % 2 = 0 then 'entrante' else 'saliente' end, 'text',
       case when n % 2 = 0 then 'Hola, me interesa saber precios y horarios del programa ' || n else 'Con gusto, te comparto la información del programa y los horarios disponibles ' || n end,
       cv.ultimo_mensaje_en - ((10 - n) || ' minutes')::interval,
       case when n % 2 = 0 then null else 'read' end
from conversaciones cv cross join generate_series(1, 9) n where cv.identificador like 'vol-%';

select (select count(*) from oportunidades) leads, (select count(*) from conversaciones) chats, (select count(*) from mensajes) mensajes;
