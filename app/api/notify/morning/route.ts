import { isIsoDay, isWeekend } from "@/lib/dates";
import { USE_EMULATOR } from "@/lib/emulator";
import { signInEnabled } from "@/lib/flags";
import { personEmail } from "@/lib/peopleInput";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const secret = process.env.CRON_SECRET;
  if (!secret?.trim() || request.headers.get("authorization") !== `Bearer ${secret}`) return reply({ error: "Unauthorized" }, 401);
  if (!signInEnabled()) return reply({ error: "Not found" }, 404);
  try {
    const { wibToday } = await import("@/lib/followupServer");
    // Only the isolated emulator smoke stack can pin a weekday; production always uses Jakarta's clock.
    const testDay = USE_EMULATOR ? process.env.MORNING_TEST_DATE : undefined;
    const today = isIsoDay(testDay) ? testDay : wibToday();
    if (isWeekend(today)) return reply({ date: today, results: [] });
    // Keep Admin and production credentials behind the flag, bearer and weekday checks.
    const morning = await import("@/lib/morningSummary.server");
    // An operator can configure one recipient, Jakarta date, and expiry for a manual invocation.
    const [resendDate, expiration, recipient] = process.env.MORNING_DUE_TODAY_RESEND?.split("|") ?? [];
    const expiresAt = Number(expiration);
    const resend = resendDate === today && Number.isSafeInteger(expiresAt) && expiresAt > Date.now() && recipient;
    const results = resend ? [await morning.sendDueTodayResend(personEmail(resend), today)] : await morning.sendMorningSummaries(today);
    return reply({ date: today, results }, results.some((result) => result.status === "failed") ? 503 : 200);
  } catch {
    return reply({ error: "Morning summaries could not be processed." }, 503);
  }
}
