-- 18/11/2026: estas funciones no revisan quién las llama, así que no deben
-- quedar abiertas a visitantes sin sesión. Las usan los webhooks (llave de
-- servidor) y el CRM (sesión iniciada); esos dos permisos se mantienen.
-- Probado antes en las dos bases dentro de una transacción deshecha.
revoke execute on function public.abrir_lead_de_whatsapp(bigint,bigint,bigint,bigint,date) from public, anon;
revoke execute on function public.anotar_canal(bigint,bigint,text,timestamp with time zone) from public, anon;
revoke execute on function public.cerrar_llamada(text,text,integer,text) from public, anon;
revoke execute on function public.cliente_de_canal(text,text,text,text) from public, anon;
revoke execute on function public.cliente_de_instagram(text,text,text) from public, anon;
revoke execute on function public.cliente_de_whatsapp(text,text) from public, anon;
revoke execute on function public.enviados_hoy() from public, anon;
revoke execute on function public.marcar_mensaje_entrante(bigint,text,timestamp with time zone) from public, anon;
revoke execute on function public.nombres_del_equipo(uuid[]) from public, anon;
revoke execute on function public.revisar_base(bigint) from public, anon;
revoke execute on function public.vendedores_para_reparto() from public, anon;
revoke execute on function public.ya_le_mandamos(bigint[],integer) from public, anon;
grant execute on function public.abrir_lead_de_whatsapp(bigint,bigint,bigint,bigint,date) to authenticated, service_role;
grant execute on function public.anotar_canal(bigint,bigint,text,timestamp with time zone) to authenticated, service_role;
grant execute on function public.cerrar_llamada(text,text,integer,text) to authenticated, service_role;
grant execute on function public.cliente_de_canal(text,text,text,text) to authenticated, service_role;
grant execute on function public.cliente_de_instagram(text,text,text) to authenticated, service_role;
grant execute on function public.cliente_de_whatsapp(text,text) to authenticated, service_role;
grant execute on function public.enviados_hoy() to authenticated, service_role;
grant execute on function public.marcar_mensaje_entrante(bigint,text,timestamp with time zone) to authenticated, service_role;
grant execute on function public.nombres_del_equipo(uuid[]) to authenticated, service_role;
grant execute on function public.revisar_base(bigint) to authenticated, service_role;
grant execute on function public.vendedores_para_reparto() to authenticated, service_role;
grant execute on function public.ya_le_mandamos(bigint[],integer) to authenticated, service_role;
