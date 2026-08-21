import { colorFor } from "@/lib/colors";

export function Chip({
  name,
  note,
  variant = "solid",
}: {
  name: string;
  note?: string;
  variant?: "solid" | "outline";
}) {
  const c = colorFor(name);
  const style =
    variant === "solid"
      ? { background: c.bg, color: c.text }
      : { background: "transparent", color: c.text, border: `1px solid ${c.text}33` };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap"
      style={style}
    >
      {name}
      {note && <span className="opacity-60 font-normal">· {note}</span>}
    </span>
  );
}
