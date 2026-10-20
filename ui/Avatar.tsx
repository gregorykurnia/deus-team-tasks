// A person's avatar (guide 4.5): initials on the person's hue, with a white edge.
// Owners are solid; a person only kept informed is outlined. Decorative: the name is beside it or in its stack.
import { hue, initials } from "@/lib/people";
import styles from "./Avatar.module.css";

export type AvatarSize = "chip" | "list" | "plan" | "page";

interface AvatarProps {
  name: string;
  size?: AvatarSize; // list 30px, plan 34px, chip 28px, page 72px
  informed?: boolean;
  className?: string;
}

export default function Avatar({ name, size = "list", informed = false, className }: AvatarProps) {
  const classes = [styles.avatar, styles[size], informed ? styles.informed : styles[`a${hue(name)}`], className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} title={name} aria-hidden="true" data-informed={informed || undefined}>
      {initials(name)}
    </span>
  );
}
