import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PAGES = new Set(["/", "/login", "/register"]);
const PRODUCT_API_PREFIXES = ["/api/ledger/v1/", "/api/agent/v1/", "/api/account/"];
const AUTH_API_PATHS = new Set([
  "/api/auth/register",
  "/api/auth/session",
  "/api/auth/csrf",
  "/api/auth/providers",
  "/api/auth/signin/credentials",
  "/api/auth/callback/credentials",
  "/api/auth/signout",
]);

function isProductApi(pathname: string): boolean {
  return PRODUCT_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();
  const isApi = pathname.startsWith("/api/");
  const isStatic = pathname.startsWith("/_next/") || pathname === "/favicon.ico" || pathname === "/favicon.svg" || pathname.startsWith("/brand/");

  if (isStatic || PUBLIC_PAGES.has(pathname)) {
    if (isApi) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.next();
  }

  if (pathname === "/api/health" || pathname === "/api/ready") {
    return NextResponse.next();
  }

  if (isApi) {
    if (AUTH_API_PATHS.has(pathname) || isProductApi(pathname)) return NextResponse.next();
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Only GET/HEAD page requests are accepted. This also closes legacy Server Action URLs.
  if (method !== "GET" && method !== "HEAD") {
    return new NextResponse("Not found", { status: 404 });
  }
  if (pathname === "/space" || pathname.startsWith("/space/")) return NextResponse.next();
  return new NextResponse("Not found", { status: 404 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg|public/).*)"],
};
