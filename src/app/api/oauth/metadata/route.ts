import { NextResponse, type NextRequest } from "next/server";
import { authServerMetadata, originOf } from "@/lib/server/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** /.well-known/oauth-authorization-server (réécrit vers cette route). */
export const GET = (req: NextRequest) => NextResponse.json(authServerMetadata(originOf(req)));
