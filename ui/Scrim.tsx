// The dim, blurred layer behind a sheet or dialog. A tap on it closes them (guide 4.11).
import styles from "./Scrim.module.css";

interface ScrimProps {
  onClick: () => void;
  over?: boolean; // behind a dialog that sits over a sheet
  phoneOnly?: boolean; // gone above 900px, for the More sheet
}

export default function Scrim({ onClick, over = false, phoneOnly = false }: ScrimProps) {
  const classes = [styles.scrim, over && styles.over, phoneOnly && styles.phoneOnly].filter(Boolean).join(" ");
  return <div className={classes} onClick={onClick} aria-hidden="true" />;
}
