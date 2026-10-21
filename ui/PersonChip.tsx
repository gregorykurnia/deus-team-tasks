// A person in a picker or a flow role (guide 4.5): a grey pill with an avatar, the name and a ×.
// The person whose page is open is blue.
import Avatar from "./Avatar";
import Icon from "./Icon";
import styles from "./PersonChip.module.css";

interface PersonChipProps {
  name: string;
  current?: boolean; // the person whose page this is
  removable?: boolean; // shows the ×; onRemove wires it up in a client component
  onRemove?: () => void;
  compact?: boolean; // the smaller read-only pill in a flow's roles (prototype .fp)
}

export default function PersonChip({ name, current = false, removable = false, onRemove, compact = false }: PersonChipProps) {
  return (
    <span className={[styles.person, current && styles.current, compact && styles.compact].filter(Boolean).join(" ")} data-current={current || undefined}>
      <Avatar name={name} size="chip" />
      <span className={styles.name}>{name}</span>
      {(removable || onRemove) && (
        <button className={styles.remove} type="button" onClick={onRemove} aria-label={`Remove ${name}`}>
          <Icon name="x" size={12} />
        </button>
      )}
    </span>
  );
}
