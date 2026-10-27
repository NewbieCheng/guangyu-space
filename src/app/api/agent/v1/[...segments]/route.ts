import { NextResponse, type NextRequest } from "next/server";
import { apiAccessFailure, resolveApiViewer } from "@/modules/guangyu-space/server/context";
import { getSummary } from "@/modules/guangyu-space/server/summary";
import {
  apiErrorResponse,
  appendCommunication,
  appendProjectLog,
  createRecord,
  getRecord,
  isRecordName,
  listCommunications,
  listCompletedTasks,
  listProjectLogs,
  listRecords,
  parseExpectedVersion,
  setDeleted,
  setTaskCompletion,
  updateRecord,
} from "@/modules/guangyu-space/server/records";

type RouteContext = { params: Promise<{ segments: string[] }> };

async function authorized(request: NextRequest, scope: string) {
  if (!request.headers.get("authorization")) return { error: Response.json({ error: { code: "UNAUTHENTICATED", message: "Agent API 需要 Bearer 授权。" } }, { status: 401 }) };
  const access = await resolveApiViewer(request, scope);
  if (access.failure) return { error: apiAccessFailure(access.failure) };
  return { viewer: access.viewer };
}

function notFound() { return NextResponse.json({ error: { code: "NOT_FOUND", message: "Agent API 路径不存在。" } }, { status: 404 }); }

export async function GET(request: NextRequest, context: RouteContext) {
  const { segments } = await context.params;
  if (segments.length === 1 && segments[0] === "health") {
    return NextResponse.json({ status: "ok", service: "guangyu-agent-api", apiVersion: "v1", timestamp: new Date().toISOString() });
  }
  const resource = segments[0] ?? "";
  const scope = resource === "summary" ? "read:summary" : resource === "tasks" && segments[1] === "history" ? "tasks:history" : "read:records";
  const access = await authorized(request, scope);
  if (access.error) return access.error;
  const viewer = access.viewer;
  try {
    if (resource === "summary" && segments.length === 1) return NextResponse.json(await getSummary(viewer));
    if (!isRecordName(resource)) return notFound();
    if (segments.length === 1) return NextResponse.json(await listRecords(resource, viewer, request.nextUrl.searchParams));
    if (resource === "tasks" && segments.length === 2 && segments[1] === "history") return NextResponse.json(await listCompletedTasks(viewer, request.nextUrl.searchParams));
    if ((resource === "customers" || resource === "partners") && segments.length === 3 && segments[2] === "communications") {
      return NextResponse.json(await listCommunications(viewer, resource === "customers" ? "CUSTOMER" : "PARTNER", segments[1]!, request.nextUrl.searchParams));
    }
    if (resource === "projects" && segments.length === 3 && segments[2] === "logs") return NextResponse.json(await listProjectLogs(viewer, segments[1]!));
    if (segments.length === 2) return NextResponse.json({ item: await getRecord(resource, viewer, segments[1]!, request.nextUrl.searchParams.get("includeDeleted") === "true") });
    return notFound();
  } catch (error) { return apiErrorResponse(error); }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { segments } = await context.params;
  const resource = segments[0] ?? "";
  let scope = "write:records";
  if ((resource === "customers" || resource === "partners") && segments[2] === "communications") scope = "append:communications";
  if (resource === "projects" && segments[2] === "logs") scope = "append:project-logs";
  if (resource === "tasks" && ["complete", "uncomplete"].includes(segments[2] ?? "")) scope = "tasks:complete";
  const access = await authorized(request, scope);
  if (access.error) return access.error;
  const viewer = access.viewer;
  try {
    if (isRecordName(resource) && segments.length === 1) {
      return NextResponse.json({ item: await createRecord(resource, viewer, await request.json(), request.headers.get("idempotency-key")) }, { status: 201 });
    }
    if ((resource === "customers" || resource === "partners") && segments.length === 3 && segments[2] === "communications") {
      return NextResponse.json({ item: await appendCommunication(viewer, resource === "customers" ? "CUSTOMER" : "PARTNER", segments[1]!, await request.json(), request.headers.get("idempotency-key")) }, { status: 201 });
    }
    if (resource === "projects" && segments.length === 3 && segments[2] === "logs") {
      return NextResponse.json({ item: await appendProjectLog(viewer, segments[1]!, await request.json(), request.headers.get("idempotency-key")) }, { status: 201 });
    }
    if (isRecordName(resource) && segments.length === 3 && segments[2] === "restore") {
      const body: unknown = await request.json();
      return NextResponse.json({ item: await setDeleted(resource, viewer, segments[1]!, parseExpectedVersion(request, body), true) });
    }
    if (resource === "tasks" && segments.length === 3 && ["complete", "uncomplete"].includes(segments[2]!)) {
      const body: unknown = await request.json();
      return NextResponse.json({ item: await setTaskCompletion(viewer, segments[1]!, parseExpectedVersion(request, body), segments[2] === "complete", request.headers.get("idempotency-key")) });
    }
    return notFound();
  } catch (error) { return apiErrorResponse(error); }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { segments } = await context.params;
  const resource = segments[0] ?? "";
  const access = await authorized(request, "write:records");
  if (access.error) return access.error;
  if (!isRecordName(resource) || segments.length !== 2) return notFound();
  try { const body: unknown = await request.json(); return NextResponse.json({ item: await updateRecord(resource, access.viewer, segments[1]!, body) }); }
  catch (error) { return apiErrorResponse(error); }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { segments } = await context.params;
  const resource = segments[0] ?? "";
  const access = await authorized(request, "write:records");
  if (access.error) return access.error;
  if (!isRecordName(resource) || segments.length !== 2) return notFound();
  try { return NextResponse.json({ item: await setDeleted(resource, access.viewer, segments[1]!, parseExpectedVersion(request), false) }); }
  catch (error) { return apiErrorResponse(error); }
}
