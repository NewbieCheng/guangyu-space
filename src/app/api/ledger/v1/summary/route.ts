import { NextResponse } from "next/server";
import { apiAccessFailure, resolveApiViewer } from "@/modules/guangyu-space/server/context";
import { getSummary } from "@/modules/guangyu-space/server/summary";

export async function GET(request: Request) {
  const access = await resolveApiViewer(request, "read:summary");
  if (access.failure) return apiAccessFailure(access.failure);
  const { viewer } = access;
  try { return NextResponse.json(await getSummary(viewer)); }
  catch { return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "经营总览暂时不可用。" } }, { status: 500 }); }
}
