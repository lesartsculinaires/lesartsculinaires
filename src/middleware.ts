import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const URL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY_ENV = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Refreshes the auth session on every request and gates the app behind login.
 *
 * Supabase access tokens are short-lived; without this the session would expire
 * mid-session and Server Components would silently start seeing no rows.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Unconfigured deployments fall through to the login page, which explains
  // what is missing rather than throwing.
  if (!URL_ENV || !KEY_ENV) return response;

  const supabase = createServerClient(URL_ENV, KEY_ENV, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLogin = pathname.startsWith("/login");

  if (!user && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // A quien ya tiene sesión no se lo expulsa de la portada: necesita poder
  // llegar para cambiar de cuenta o cerrar sesión. La propia pantalla avisa
  // que la sesión está abierta y ofrece las dos salidas.

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!api/whatsapp|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
