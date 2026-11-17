import { isWeekend } from "@/lib/dates";
import { signInEnabled } from "@/lib/flags";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const secret = process.env.CRON_SECRET;
  if (!secret?.trim() || request.headers.get("authorization") !== `Bearer ${secret}`) return reply({ error: "Unauthorized" }, 401);
  if (!signInEnabled()) return reply({ error: "Not found" }, 404);
  try {
    const { wibToday } = await import("@/lib/followupServer");
    const today = wibToday();
    if (isWeekend(today)) return reply({ date: today, results: [] });
    // Keep Admin and production credentials behind the flag, bearer and weekday checks.
    const { sendMorningSummaries } = await import("@/lib/morningSummary.server");
    const results = await sendMorningSummaries(today);
    return reply({ date: today, results }, results.some((result) => result.status === "failed") ? 503 : 200);
  } catch {
    return reply({ error: "Morning summaries could not be processed." }, 503);
  }
}
