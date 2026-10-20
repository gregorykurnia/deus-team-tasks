// A small spinner for work in progress. Decorative: the words beside it say what is happening.
import styles from "./Spinner.module.css";

export default function Spinner({ light = false }: { light?: boolean }) {
  return <span className={light ? `${styles.spinner} ${styles.light}` : styles.spinner} aria-hidden="true" />;
}
