import { NextResponse, type NextRequest } from "next/server";
import { hasSameOrigin, requireViewer } from "@/modules/guangyu-space/server/context";
import { createAgentCredential, listAgentCredentials } from "@/modules/guangyu-space/server/agents";
import { apiErrorResponse } from "@/modules/guangyu-space/server/records";

export async function GET() {
  const viewer = await requireViewer();
  if (!viewer) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "请先登录。" } }, { status: 401 });
  try { return NextResponse.json({ items: await listAgentCredentials(viewer) }); }
  catch { return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "授权列表暂时不可用。" } }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: { code: "INVALID_ORIGIN", message: "请求来源无效。" } }, { status: 403 });
  const viewer = await requireViewer();
  if (!viewer) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "请先登录。" } }, { status: 401 });
  try { return NextResponse.json(await createAgentCredential(viewer, await request.json()), { status: 201 }); }
  catch (error) { return apiErrorResponse(error); }
}
