import Icon from "@/ui/Icon";
import styles from "./SignIn.module.css";

// Shared with the notification setup in A5. Installation memory isn't proof of standalone mode.
export function needsHomeScreen(): boolean {
  const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return apple && !window.matchMedia("(display-mode: standalone)").matches && !(navigator as Navigator & { standalone?: boolean }).standalone;
}

export default function HomeScreenSteps() {
  return <ol className={styles.steps}>
    <li><span>Tap <b>Share</b> <Icon name="share" size={16} /> in Safari’s bar.</span></li>
    <li><span>Choose <b>Add to Home Screen</b> <Icon name="addsq" size={16} />, then <b>Add</b>.</span></li>
    <li><span>Open <b>DEUS Space</b> from your Home Screen and sign in there.</span></li>
  </ol>;
}
