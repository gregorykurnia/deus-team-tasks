"use client";

// The install sheet (A2, guide 6.9). It opens with ?install=1 from the side bar or More, so a reload keeps it and the
// phone's back gesture closes it. Which version it shows depends on the device: the browser's own Install button
// where the browser offers one, the three Safari steps on iPhone and iPad, a green notice once installed, and (a
// provisional version, gap N16) a plain note in a browser that offers neither.
import Image from "next/image";
import { useState } from "react";
import { useOverParam } from "@/desk/useOverParam";
import { useInstalled } from "@/desk/useInstalled";
import Button from "@/ui/Button";
import Icon, { type IconName } from "@/ui/Icon";
import Notice from "@/ui/Notice";
import Sheet, { SheetSpacer } from "@/ui/Sheet";
import { useToast } from "@/ui/Toaster";
import { isAppleTouchDevice, promptInstall, useCanPrompt, useOfferSpent } from "./installPrompt";
import styles from "./Install.module.css";

const NAME = "DEUS Team Space";

const PERKS: [IconName, string][] = [
  ["install", "Opens from your home screen or your apps, full screen, like any other app"],
  ["wifi", "Opens even with no connection, showing what was loaded last"],
  ["sync", "Always the latest version. Nothing to update by hand"],
];

export default function InstallHost() {
  const { open, close } = useOverParam("install");
  return <InstallSheet open={open} onClose={close} />;
}

export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const installed = useInstalled();
  const canPrompt = useCanPrompt();
  const spent = useOfferSpent();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // Read in the browser only: the sheet is never open during the server's render.
  const apple = open && isAppleTouchDevice();
  const kind = installed ? "installed" : apple ? "ios" : canPrompt ? "prompt" : "unavailable";

  const install = async () => {
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    if (outcome === "accepted") {
      onClose();
      toast(`Installed. ${NAME} is now with your apps.`);
    } else if (outcome === "dismissed") {
      onClose();
    }
    // "unavailable": the sheet re-renders into the version that says so.
  };

  const footer =
    kind === "prompt" ? (
      <>
        <SheetSpacer />
        <Button onClick={onClose}>Not now</Button>
        <Button variant="main" data-install busy={busy} busyLabel="Installing…" onClick={install}>
          <Icon name="download" size={18} />
          Install
        </Button>
      </>
    ) : kind === "unavailable" ? (
      <>
        <SheetSpacer />
        <Button onClick={onClose}>Close</Button>
      </>
    ) : undefined;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={kind === "installed" ? `${NAME} is installed` : `Install ${NAME}`}
      size="narrow"
      short
      initialFocus={kind === "prompt" ? "[data-install]" : undefined}
      footer={footer}
    >
      <div className={styles.hero}>
        <Image className={styles.icon} src="/icon-192x192.png" alt="" width={64} height={64} unoptimized />
        <div>
          <b>{NAME}</b>
          <small>For phones and computers. Everything stays in step on each.</small>
        </div>
      </div>
      {kind !== "installed" && (
        <ul className={styles.perks}>
          {PERKS.map(([icon, text]) => (
            <li key={icon}>
              <Icon name={icon} size={18} />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      )}
      {kind === "ios" && (
        <>
          <ol className={styles.steps}>
            <li>
              <span className={styles.n}>1</span>
              <span>
                In Safari, tap <b>Share</b>
              </span>
              <span className={styles.key}>
                <Icon name="share" size={18} />
              </span>
            </li>
            <li>
              <span className={styles.n}>2</span>
              <span>
                Scroll down and tap <b>Add to Home Screen</b>
              </span>
              <span className={styles.key}>
                <Icon name="addsq" size={18} />
              </span>
            </li>
            <li>
              <span className={styles.n}>3</span>
              <span>
                Tap <b>Add</b> in the top corner
              </span>
            </li>
          </ol>
          <p className={styles.help}>On iPhone and iPad, apps are added from Safari. In other browsers, open this page in Safari first.</p>
        </>
      )}
      {kind === "installed" && (
        <div className={styles.ok}>
          <Notice tone="success" title="Installed on this device.">
            Open {NAME} from your home screen or your apps.
          </Notice>
        </div>
      )}
      {kind === "unavailable" && spent && (
        <div className={styles.ok}>
          <Notice tone="info" title="The browser’s install offer was closed.">
            To install it now, use Install in the browser’s menu, or reload the page to be offered it again.
          </Notice>
        </div>
      )}
      {kind === "unavailable" && !spent && (
        <div className={styles.ok}>
          <Notice tone="info" title="This browser can’t install it from here.">
            In Chrome or Edge, use the install button at the end of the address bar. On iPhone or iPad, open this page in Safari.
          </Notice>
        </div>
      )}
    </Sheet>
  );
}
