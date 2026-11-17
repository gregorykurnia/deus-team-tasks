import { signInEnabled } from "./flags";

export async function handleAuthCode(request: Request, kind: "code" | "verify"): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  if (!signInEnabled()) return Response.json({ error: "Not found" }, { status: 404, headers });
  let body: Record<string, string>;
  try {
    const text = await request.text();
    if (text.length > 1024) throw new Error("Too large");
    body = JSON.parse(text);
    const keys = kind === "code" ? ["email"] : ["email", "code"];
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== keys.length
      || !keys.every((key) => typeof body[key] === "string")) throw new Error("Invalid body");
  } catch {
    return Response.json({ error: kind === "code" ? "Send an email as JSON." : "Send an email and code as JSON." }, { status: 400, headers });
  }
  try {
    // With the flag off, neither requests nor builds initialize Firebase Admin or need secrets.
    const service = await import("./signInCodes.server");
    const result = kind === "code" ? await service.requestSignInCode(body.email) : await service.verifySignInCode(body.email, body.code);
    const retry = "status" in result && (result.status === "tooMany" ? result.minutes * 60 : result.status === "wait" ? result.seconds : null);
    return Response.json(result, { status: retry ? 429 : 200, headers: retry ? { ...headers, "Retry-After": String(retry) } : headers });
  } catch {
    // SMTP/Auth errors can contain credentials, email content or tokens: never echo or log them.
    return Response.json({ status: "unavailable", error: "We couldn’t finish that request. Try again shortly." }, { status: 503, headers });
  }
}
