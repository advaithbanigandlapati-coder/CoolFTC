import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(),
                 setAll: (cookies: { name: string; value: string; options?: Record<string, unknown> }[]) =>
                   cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthRoute = request.nextUrl.pathname.startsWith("/login") || request.nextUrl.pathname.startsWith("/signup");
  const isAppRoute = request.nextUrl.pathname.startsWith("/app");

  if (!user && isAppRoute) return NextResponse.redirect(new URL("/login", request.url));
  if (user && isAuthRoute)  return NextResponse.redirect(new URL("/app", request.url));
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"] };
