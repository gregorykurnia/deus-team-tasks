// A stack of avatars (guide 4.5): overlapping by 9px, up to three, then "+n". The label reads everyone.
import Avatar from "./Avatar";
import styles from "./AvatarStack.module.css";

export interface Informed {
  name: string;
  note?: string; // "backup"
}

interface AvatarStackProps {
  responsible: string[];
  informed?: Informed[];
  max?: number; // 3 by default
}

export default function AvatarStack({ responsible, informed = [], max = 3 }: AvatarStackProps) {
  const people = [
    ...responsible.map((name) => ({ name, informed: false })),
    ...informed.map((p) => ({ name: p.name, informed: true })),
  ];
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const owners = responsible.join(", ") || "nobody";
  const others = informed.map((p) => (p.note ? `${p.name} (${p.note})` : p.name)).join(", ");
  const label = `Responsible: ${owners}${informed.length ? `. Informed: ${others}` : ""}`;

  return (
    <span className={styles.stack} role="img" aria-label={label}>
      {shown.map((p) => (
        <Avatar key={p.name} name={p.name} informed={p.informed} />
      ))}
      {rest > 0 && <span className={styles.more}>+{rest}</span>}
    </span>
  );
}
