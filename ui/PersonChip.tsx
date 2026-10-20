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
}

export default function PersonChip({ name, current = false, removable = false, onRemove }: PersonChipProps) {
  return (
    <span className={current ? `${styles.person} ${styles.current}` : styles.person} data-current={current || undefined}>
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
