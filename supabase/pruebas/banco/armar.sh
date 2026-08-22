#!/bin/bash
# Levanta un banco de pruebas local del CRM, entero, desde cero.
#
# Para qué: probar cambios contra una base de verdad —con RLS, triggers y
# vistas— sin tocar Supabase. Lo que anda acá anda en producción, porque el
# esquema sale de las mismas migraciones.
#
#   bash supabase/pruebas/banco/armar.sh
#
# Deja andando cuatro cosas:
#   5511  Postgres con el esquema completo y datos inventados
#   3140  PostgREST, que es lo que Supabase pone delante de la base
#   3141  un proxy que traduce las rutas de Supabase a las de PostgREST
#   3143  un Realtime de mentira, para probar los cambios en vivo
#
# Falta sólo levantar la aplicación; el script lo dice al terminar.
set -u

AQUI="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$AQUI/../../.." && pwd)"
cd "$AQUI" || exit 1

psql_() { su postgres -c "psql -h /tmp -p 5511 -d crm -q $*" 2>&1; }

echo "── 1. Postgres ──"
pg_isready -h /tmp -p 5511 >/dev/null 2>&1 || {
  su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/16/main \
    -o '-p 5511 -k /tmp -c config_file=/etc/postgresql/16/main/postgresql.conf' \
    -l /tmp/pg.log start" >/dev/null 2>&1
  sleep 4
}
# PostgREST entra como «authenticator», que no es un usuario del sistema, así
# que la autenticación por par no le sirve.
if ! grep -q "^local all all trust" /etc/postgresql/16/main/pg_hba.conf; then
  printf 'local all all trust\nhost all all 127.0.0.1/32 trust\n' > /tmp/hba.new
  cat /etc/postgresql/16/main/pg_hba.conf >> /tmp/hba.new
  cp /tmp/hba.new /etc/postgresql/16/main/pg_hba.conf
  su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/16/main \
    -o '-c config_file=/etc/postgresql/16/main/postgresql.conf' reload" >/dev/null 2>&1
fi
su postgres -c "createdb -h /tmp -p 5511 crm" 2>/dev/null
echo "   ok"

echo "── 2. esquema: shim, bootstrap y todas las migraciones ──"
# El shim inventa lo que Supabase pone de fábrica y un Postgres pelado no
# tiene: el esquema `auth`, `auth.uid()` y los roles.
cp "$REPO/supabase/pruebas/01_shim_supabase.sql" "$REPO/supabase/bootstrap.sql" /tmp/
mkdir -p /tmp/mig && cp "$REPO"/supabase/migrations/*.sql /tmp/mig/
chmod -R a+r /tmp/*.sql /tmp/mig
psql_ "-f /tmp/01_shim_supabase.sql" | grep -i "^ERROR" | head -3
psql_ "-f /tmp/bootstrap.sql" | grep -iE "^psql.*ERROR" | head -3
for m in /tmp/mig/*.sql; do
  # «cannot drop columns from view» sale al recorrer migraciones que rearman
  # `vw_pipeline` sobre una base que ya tiene la versión final. Es inofensivo.
  out=$(psql_ "-f $m" | grep -iE "ERROR" | grep -v "cannot drop columns from view" | head -1)
  [ -n "$out" ] && echo "   ✗ $(basename "$m"): $out"
done
echo "   $(su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -c \
  \"select count(*) from information_schema.tables where table_schema='public'\"") tablas"

echo "── 3. roles de PostgREST ──"
psql_ "-c \"do \\\$\\\$ begin
  if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end \\\$\\\$;
grant anon, authenticated to authenticator;
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;\"" >/dev/null
echo "   ok"

echo "── 4. gente y fichas inventadas ──"
cp "$AQUI/datos.sql" /tmp/banco-datos.sql && chmod a+r /tmp/banco-datos.sql
psql_ "-v ON_ERROR_STOP=1 -f /tmp/banco-datos.sql" | grep -i "ERROR" | head -3
echo "   $(su postgres -c "psql -h /tmp -p 5511 -d crm -A -t -c 'select count(*) from oportunidades'") oportunidades"

echo "── 5. PostgREST ──"
[ -x ./postgrest ] || {
  curl -sL --max-time 240 -o pgrst.tar.xz \
    "https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz" &&
    tar xf pgrst.tar.xz && rm -f pgrst.tar.xz
}
cat > v.conf <<'CONF'
db-uri = "postgres://authenticator@/crm?host=/tmp&port=5511"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "una-clave-de-pruebas-larguisima-para-firmar-jwt-0123456789"
server-port = 3140
CONF
pkill -f "postgrest v.conf" 2>/dev/null
nohup ./postgrest v.conf > pgrst.log 2>&1 &
sleep 7
echo "   $(curl -s -o /dev/null -w '%{http_code}' --noproxy '*' \
  'http://127.0.0.1:3140/vendedores?select=id&limit=1')"

echo "── 6. sesiones de prueba ──"
node -e '
import("./jwt.mjs").then(async ({firmar}) => {
  const fs = await import("node:fs");
  for (const [n, id, mail] of [
    ["ale",  "11111111-0000-0000-0000-000000000001", "ale@lac.test"],
    ["huri", "44444444-0000-0000-0000-000000000004", "huri@lac.test"],
    ["jefa", "cccccccc-0000-0000-0000-000000000003", "jefa@lac.test"],
  ]) fs.writeFileSync(`jwt-${n}.txt`, firmar(id, mail));
  fs.writeFileSync("anon.txt", firmar("", "", "anon"));
});
' && echo "   ok"

echo "── 7. proxy y realtime ──"
# `--prefix .` es lo que evita que npm suba buscando un package.json y
# termine agregando estas herramientas a las dependencias del CRM.
[ -d node_modules/ws ] || npm i --prefix . --silent >/dev/null 2>&1
pkill -f "node pxv.js" 2>/dev/null; pkill -f "node realtime.js" 2>/dev/null
sleep 1
nohup node realtime.js > realtime.log 2>&1 &
sleep 1
nohup node pxv.js > pxv.log 2>&1 &
sleep 2
echo "   proxy $(curl -s -o /dev/null -w '%{http_code}' --noproxy '*' \
  'http://127.0.0.1:3141/rest/v1/vendedores?select=id&limit=1')"

echo ""
echo "Listo. Para la aplicación, desde la raíz del repo:"
echo "  printf 'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3141\\nNEXT_PUBLIC_SUPABASE_ANON_KEY=%s\\n' \"\$(cat $AQUI/anon.txt)\" > .env.local"
echo "  npm run build && npx next start -p 3142"
echo ""
echo "Ojo: .env.local queda apuntando al banco. Restauralo antes de desplegar."
