import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Middleware only refreshes the Supabase session cookie — it does NOT redirect.
// Auth-based redirects are handled client-side in app/app/layout.tsx where the
// cookie is always readable. Doing redirects here causes a race condition on
// Edge Runtime where the cookie set by createBrowserClient isn't visible yet.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies: { name: string; value: string; options?: Record<string, unknown> }[]) =>
          cookies.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          ),
      },
    }
  );

  // This refreshes the session if expired — required for Server Components to work.
  // We intentionally ignore the result; redirects are handled in the layout.
  await supabase.auth.getSession();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
