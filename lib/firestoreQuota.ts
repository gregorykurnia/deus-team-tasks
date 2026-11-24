// Firestore refuses a request with "resource-exhausted" when a project's usage quota is used up. On 2026-11-23 the
// tasks project ran past the free daily read limit: previews still worked (they read through the listen stream),
// but every chat save failed with a vague "could not confirm" message. A refused request writes nothing.
export function isQuotaError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  // The web SDK uses the string code; the Admin SDK uses the gRPC number (8).
  return code === "resource-exhausted" || code === 8 || (typeof message === "string" && /RESOURCE_EXHAUSTED/.test(message));
}

// For a refused transaction: nothing in it was committed.
export const QUOTA_NOT_SAVED = "Teams DEUS's database refused the save because a usage limit was reached, so nothing was saved. Try again in a few minutes.";

// For a refusal anywhere else in a request: a read, or a save step where an earlier step may already have saved.
export const QUOTA_REFUSED = "Teams DEUS's database refused the request because a usage limit was reached. Try again in a few minutes. If this was a save, find the tasks first to check what they hold now.";

// Runs a Firestore transaction and turns a quota refusal into the caller's own public error.
export async function refuseOnQuota<T>(work: () => Promise<T>, publicError: (message: string) => Error): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw isQuotaError(error) ? publicError(QUOTA_NOT_SAVED) : error;
  }
}

// Server log line for a tool failure the caller only sees as a generic message (named by that message).
// Error kind and code; the message only from Firestore, whose messages hold no task text.
export function logToolFailure(failure: string, error: unknown) {
  const { name, code, message } = (typeof error === "object" && error !== null ? error : {}) as
    { name?: unknown; code?: unknown; message?: unknown };
  const text = name === "FirebaseError" && typeof message === "string" ? `: ${message.slice(0, 200)}` : "";
  console.error(`MCP tool failed ("${failure.slice(0, 60)}"): ${String(name ?? "Error")}${code !== undefined ? ` [${String(code)}]` : ""}${text}`);
}
