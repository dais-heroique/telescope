import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/login", "/api/auth/login", "/api/auth/logout"];

/** Protège tout le site : session JWT signée (cookie). La révocation d'un utilisateur est vérifiée côté serveur (getUser). */
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (PUBLIC.some((p) => path === p)) return NextResponse.next();

  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    // Développement local sans AUTH_SECRET : accès libre. En production : fermé.
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("AUTH_SECRET non configuré", { status: 503 });
  }
  const token = req.cookies.get("vigie_session")?.value;
  let ok = false;
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
      ok = true;
    } catch {
      ok = false;
    }
  }
  if (ok) return NextResponse.next();
  if (path.startsWith("/api/")) return NextResponse.json({ error: "non authentifié" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
