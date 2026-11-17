import { signInEnabled } from "./flags";

export async function handlePush(request: Request, action: "save" | "remove" | "test"): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  const reply = (body: object, status = 200) => Response.json(body, { status, headers });
  if (!signInEnabled()) return reply({ error: "Not found" }, 404);
  const token = /^Bearer ([^\s]{1,8192})$/i.exec(request.headers.get("authorization") || "")?.[1];
  if (!token) return reply({ error: "Sign in first." }, 401);
  try {
    // Disabled routes must not initialize Admin or require any secrets.
    const service = await import("./push.server");
    const identity = await service.pushIdentity(token);
    if (!identity) return reply({ error: "Sign in first." }, 401);
    const { email } = identity;
    if (!await service.activePushPerson(email)) return reply({ error: "Access has been removed." }, 403);
    if (identity.revoked) return reply({ error: "Sign in first." }, 401);
    let body: unknown;
    try {
      const text = await request.text();
      if (text.length > 8192) throw new Error("Too large");
      body = JSON.parse(text);
      if (action === "save") body = service.pushSubscription(body);
      else {
        if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("endpoint" in body)) throw new Error("Invalid body");
        body = service.pushEndpoint(body.endpoint);
      }
    } catch { return reply({ error: "Send a valid push subscription or endpoint as JSON." }, 400); }
    try {
      if (action === "save") return reply({ status: "saved", id: await service.savePushDevice(email, body) });
      if (action === "remove") {
        await service.removePushDevice(email, body as string);
        return reply({ status: "removed" });
      }
      const result = await service.sendPushToDevice(email, service.pushDeviceId(body as string), {
        title: "Notifications work", body: "New tasks and the 09:00 summary will arrive here.", url: "/",
      });
      if (result === "sent") return reply({ status: "sent" });
      if (result === "inactive") return reply({ error: "Access has been removed." }, 403);
      if (result === "missing" || result === "gone") return reply({ error: "Turn on notifications on this device again." }, result === "gone" ? 410 : 404);
      return reply({ error: "We couldn’t send the test. Try again shortly." }, 503);
    } catch (error) {
      if (error instanceof service.PushAccessError) return reply({ error: "Access has been removed." }, 403);
      throw error;
    }
  } catch { return reply({ error: "We couldn’t finish that request. Try again shortly." }, 503); }
}
