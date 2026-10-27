export function isSameOriginRequest(
  request: Pick<Request, "headers" | "url">,
  appUrl?: string,
): boolean {
  const rawOrigin = request.headers.get("origin");
  if (!rawOrigin) return false;

  try {
    const origin = new URL(rawOrigin);
    if (origin.protocol !== "http:" && origin.protocol !== "https:") {
      return false;
    }
    if (
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    ) {
      return false;
    }

    const requestUrl = new URL(request.url);
    const allowedOrigins = new Set([requestUrl.origin]);
    const requestHost = request.headers.get("host");

    if (requestHost && !requestHost.includes(",")) {
      try {
        allowedOrigins.add(
          new URL(`${requestUrl.protocol}//${requestHost}`).origin,
        );
      } catch {
        // Ignore malformed Host values and keep the request URL check.
      }
    }

    if (appUrl) {
      try {
        allowedOrigins.add(new URL(appUrl).origin);
      } catch {
        // An invalid optional APP_URL must not widen the accepted origins.
      }
    }

    return allowedOrigins.has(origin.origin);
  } catch {
    return false;
  }
}
