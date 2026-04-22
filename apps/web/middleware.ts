import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Start with a pass-through response. We'll write cookies to it as the
  // Supabase client refreshes the session.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          // Write cookies to BOTH the request (so getUser sees them) AND
          // the response (so the browser receives them).
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // This refreshes the session if it's expired, and triggers setAll if needed.
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith("/login") || path.startsWith("/signup");
  const isAppRoute = path.startsWith("/app");

  // CRITICAL: when redirecting, carry forward the cookies from supabaseResponse.
  // If we return a fresh NextResponse.redirect() the refreshed session cookies
  // are lost and the user gets logged out in an infinite loop.
  if (!user && isAppRoute) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    // Copy refreshed cookies (if any) to the redirect response
    supabaseResponse.cookies.getAll().forEach((c) => {
      redirect.cookies.set(c.name, c.value, c);
    });
    return redirect;
  }

  if (user && isAuthRoute) {
    const redirect = NextResponse.redirect(new URL("/app", request.url));
    supabaseResponse.cookies.getAll().forEach((c) => {
      redirect.cookies.set(c.name, c.value, c);
    });
    return redirect;
  }

  // IMPORTANT: Return the supabaseResponse (which has the refreshed cookies),
  // not a fresh NextResponse.
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, favicon-*.png, icon-*.png, manifest, sw.js, apple-touch-icon
     * - api routes (they handle their own auth)
     */
    "/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|apple-touch-icon.*|manifest\\.webmanifest|sw\\.js|api).*)",
  ],
};
