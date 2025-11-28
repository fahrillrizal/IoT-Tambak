import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedRoutes = ["/", "/smart-feeder", "/history", "/settings"];
const authRoutes = ["/login", "/register", "/forgot-password"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const sessionToken =
    request.cookies.get("__Secure-authjs.session-token")?.value ||
    request.cookies.get("authjs.session-token")?.value;

  const hasSession = !!sessionToken;

  const isProtectedRoute = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
  const isAuthRoute = authRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  if (isProtectedRoute && !hasSession) {
    // Simpan intended URL di cookie untuk dibaca oleh client
    const response = NextResponse.redirect(new URL("/login", request.url));
    
    // Hanya set cookie jika bukan dari root
    if (pathname !== "/") {
      response.cookies.set("auth-redirect", pathname, {
        httpOnly: false,
        maxAge: 60 * 5, // 5 menit
        path: "/",
      });
    }
    
    return response;
  }

  if (isAuthRoute && hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};