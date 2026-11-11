import { NextResponse } from "next/server";
import { calendarWritesEnabled, syncTaskCalendar } from "@/lib/calendarSync";

export function GET() {
  return NextResponse.json({ enabled: calendarWritesEnabled() });
}

function isTaskId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && Buffer.byteLength(id, "utf8") <= 1500
    && !id.includes("/") && id !== "." && id !== ".." && !/^__.*__$/.test(id);
}

export async function POST(request: Request) {
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Send a JSON object with 1–50 task IDs." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Object.keys(body).length !== 1 || !Array.isArray(body.taskIds)
    || body.taskIds.length < 1 || body.taskIds.length > 50 || !body.taskIds.every(isTaskId)) {
    return NextResponse.json({ error: "Send a JSON object with 1–50 task IDs only." }, { status: 400 });
  }
  const origin = new URL(request.url).origin;
  const results = [];
  for (const taskId of body.taskIds) results.push(await syncTaskCalendar(taskId, origin));
  return NextResponse.json({ results });
}
