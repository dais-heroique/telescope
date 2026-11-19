import { NextResponse, type NextRequest } from "next/server";
import { originOf, resourceMetadata } from "@/lib/server/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** /.well-known/oauth-protected-resource (réécrit vers cette route) : indique à Claude où s'authentifier. */
export const GET = (req: NextRequest) => NextResponse.json(resourceMetadata(originOf(req)));
