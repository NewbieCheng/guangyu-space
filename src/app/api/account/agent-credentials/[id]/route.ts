import { NextResponse, type NextRequest } from "next/server";
import { hasSameOrigin, requireViewer } from "@/modules/guangyu-space/server/context";
import { revokeAgentCredential } from "@/modules/guangyu-space/server/agents";
import { apiErrorResponse } from "@/modules/guangyu-space/server/records";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: { code: "INVALID_ORIGIN", message: "请求来源无效。" } }, { status: 403 });
  const viewer = await requireViewer();
  if (!viewer) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "请先登录。" } }, { status: 401 });
  const { id } = await context.params;
  try { return NextResponse.json(await revokeAgentCredential(viewer, id)); }
  catch (error) { return apiErrorResponse(error); }
}
