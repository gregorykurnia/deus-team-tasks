import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

describe.each(["/sign-in", "/leave"])("optional offline page %s", (path) => {
  it.each([200, 404, 503])("caches it when enabled; its disabled 404 keeps installation working (%s)", async (status) => {
    const stored = new Map<string, Response>();
    let offline = false;
    type WorkerEvent = { waitUntil: (promise: Promise<unknown>) => void; respondWith?: (promise: Promise<Response>) => void; request?: unknown };
    const handlers = new Map<string, (event: WorkerEvent) => void>();
    runInNewContext(readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8"), {
      URL, Response, setTimeout, clearTimeout,
      self: { location: { href: "https://deus.invalid/sw.js?v=test", origin: "https://deus.invalid" }, addEventListener: (name: string, callback: (event: WorkerEvent) => void) => handlers.set(name, callback), skipWaiting: () => {} },
      caches: { open: async () => ({ put: async (path: string, response: Response) => { stored.set(path, response); }, match: async (path: string) => stored.get(path)?.clone(), add: async () => {} }) },
      fetch: async (url: string) => { if (offline) throw new Error("offline"); return new Response(url === path ? "optional-page" : "app-page", { status: url === path ? status : 200 }); },
    });
    let work: Promise<unknown> = Promise.resolve();
    handlers.get("install")!({ waitUntil: (promise) => { work = promise; } });
    if (status === 503) await expect(work).rejects.toThrow(`${path}: 503`);
    else {
      await work;
      expect(stored.has("/")).toBe(true);
      expect(stored.has(path)).toBe(status === 200);
      if (status === 200) {
        offline = true;
        let reply: Promise<Response> | undefined;
        handlers.get("fetch")!({ request: { method: "GET", mode: "navigate", headers: new Headers(), url: `https://deus.invalid${path}?next=%2Ftasks&request=id` }, waitUntil: () => {}, respondWith: (promise) => { reply = promise; } });
        expect(reply).toBeDefined();
        expect(await (await reply!).text()).toBe("optional-page");
      }
    }
  });
});
