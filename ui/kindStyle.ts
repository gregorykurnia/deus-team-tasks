// A kind of work's three colours as CSS variables on an element: --kind for marks, --kind-soft for backgrounds and --kind-ink
// for words on them (guide 2.1).
import type { CSSProperties } from "react";
import type { Kind } from "@/lib/kinds";

// The one mapping from a kind of work to its token names (--pro, --cli, --int).
export const KIND_TOKEN: Record<Kind, "pro" | "cli" | "int"> = { prospect: "pro", client: "cli", internal: "int" };

export function kindStyle(kind: Kind): CSSProperties {
  const t = KIND_TOKEN[kind];
  return { "--kind": `var(--${t})`, "--kind-soft": `var(--${t}-soft)`, "--kind-ink": `var(--${t}-ink)` } as CSSProperties;
}
