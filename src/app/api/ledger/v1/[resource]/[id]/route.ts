import { NextResponse, type NextRequest } from "next/server";
import { apiAccessFailure, hasSameOrigin, resolveApiViewer } from "@/modules/guangyu-space/server/context";
import { apiErrorResponse, getRecord, isRecordName, parseExpectedVersion, setDeleted, updateRecord } from "@/modules/guangyu-space/server/records";

type RouteContext = { params: Promise<{ resource: string; id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const access = await resolveApiViewer(request, "read:records");
  if (access.failure) return apiAccessFailure(access.failure);
  const { viewer } = access;
  const { resource, id } = await context.params;
  if (!isRecordName(resource)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "接口不存在。" } }, { status: 404 });
  try { return NextResponse.json({ item: await getRecord(resource, viewer, id, request.nextUrl.searchParams.get("includeDeleted") === "true") }); }
  catch (error) { return apiErrorResponse(error); }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: { code: "INVALID_ORIGIN", message: "请求来源无效。" } }, { status: 403 });
  const access = await resolveApiViewer(request, "write:records");
  if (access.failure) return apiAccessFailure(access.failure);
  const { viewer } = access;
  const { resource, id } = await context.params;
  if (!isRecordName(resource)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "接口不存在。" } }, { status: 404 });
  try { return NextResponse.json({ item: await updateRecord(resource, viewer, id, await request.json()) }); }
  catch (error) { return apiErrorResponse(error); }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: { code: "INVALID_ORIGIN", message: "请求来源无效。" } }, { status: 403 });
  const access = await resolveApiViewer(request, "write:records");
  if (access.failure) return apiAccessFailure(access.failure);
  const { viewer } = access;
  const { resource, id } = await context.params;
  if (!isRecordName(resource)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "接口不存在。" } }, { status: 404 });
  try { return NextResponse.json({ item: await setDeleted(resource, viewer, id, parseExpectedVersion(request), false) }); }
  catch (error) { return apiErrorResponse(error); }
}
