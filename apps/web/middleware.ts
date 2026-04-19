import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) =>
          cookies.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          ),
      },
    }
  );

  // getSession() reads directly from the cookie — no network call, never returns
  // null just because Supabase's auth server is slow or unreachable in Edge runtime
  const { data: { session } } = await supabase.auth.getSession();

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login") ||
                      request.nextUrl.pathname.startsWith("/signup");
  const isAppRoute  = request.nextUrl.pathname.startsWith("/app");

  if (!session && isAppRoute)  return NextResponse.redirect(new URL("/login", request.url));
  if (session  && isAuthRoute) return NextResponse.redirect(new URL("/app",   request.url));

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
