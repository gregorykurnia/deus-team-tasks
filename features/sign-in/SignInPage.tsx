"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { codeDigits, safeSignInNext } from "@/lib/signInClient";
import { acceptSignInToken, retrySignInSession, useSignInSession } from "@/lib/useSignedIn";
import Button from "@/ui/Button";
import Field from "@/ui/Field";
import Icon from "@/ui/Icon";
import { TextInput } from "@/ui/Inputs";
import Notice from "@/ui/Notice";
import { useToast } from "@/ui/Toaster";
import HomeScreenSteps, { needsHomeScreen } from "./HomeScreenSteps";
import styles from "./SignIn.module.css";
import { showSignInNotice } from "./signInNotice";
import { afterSignInNotifications } from "@/lib/useNotifications";

const emptyCode = () => Array<string>(6).fill("");
const noSubscription = () => () => {};
const afterSeconds = (seconds: number) => Date.now() + seconds * 1000;
function subscribeOnline(listener: () => void) {
  const reconnect = () => { retrySignInSession(); listener(); };
  window.addEventListener("online", reconnect);
  window.addEventListener("offline", listener);
  return () => { window.removeEventListener("online", reconnect); window.removeEventListener("offline", listener); };
}

export default function SignInPage() {
  const router = useRouter();
  const next = safeSignInNext(useSearchParams().get("next"));
  const session = useSignInSession();
  const toast = useToast();
  const ios = useSyncExternalStore(noSubscription, needsHomeScreen, () => null);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [anyway, setAnyway] = useState(false);
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [digits, setDigits] = useState(emptyCode);
  const [busy, setBusy] = useState<"send" | "verify" | "paste" | null>(null);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [emailErrorAttempt, setEmailErrorAttempt] = useState(0);
  const [status, setStatus] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const blocked = blockedUntil > now;

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { mounted.current = false; controller.current?.abort(); clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (session.ready && session.person && !pending.current) router.replace(next);
  }, [session, next, router]);

  async function run(kind: "send" | "verify", code = digits.join("")) {
    if (pending.current || blocked || !session.ready) return;
    const address = email.trim().toLowerCase();
    setFieldError(""); setError(""); setStatus("");
    const emailError = (message: string) => { setFieldError(message); setEmailErrorAttempt((attempt) => attempt + 1); };
    if (kind === "send" && !/^[^\s@]+@deushcs\.com$/.test(address)) {
      emailError("Use your @deushcs.com email."); return;
    }
    if (kind === "verify" && !/^\d{6}$/.test(code)) return;
    if (!navigator.onLine) {
      setError(kind === "send" ? "No connection. The code wasn’t sent." : "No connection. Connect, then try signing in again."); return;
    }
    pending.current = true; setBusy(kind);
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 15_000);
    try {
      const response = await fetch(kind === "send" ? "/api/auth/code" : "/api/auth/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "send" ? { email: address } : { email: address, code }), signal: abort.signal,
      });
      const answer = await response.json();
      if (!mounted.current || abort.signal.aborted) return;
      const answeredAt = afterSeconds(0);
      setNow(answeredAt);
      if (typeof answer.token === "string" && response.ok && kind === "verify") {
        const person = await acceptSignInToken(answer.token);
        const destination = await afterSignInNotifications(next, person.email);
        if (!mounted.current) return;
        showSignInNotice(toast, person.name);
        router.replace(destination);
      } else if (answer.status === "sent" && response.ok && kind === "send") {
        setEmail(address); setStep("code"); setDigits(emptyCode());
        setResendAt(answeredAt + 60_000); setStatus("Code sent. Check your inbox.");
        requestAnimationFrame(() => inputs.current[0]?.focus());
      } else if (answer.status === "wrongDomain") emailError("Use your @deushcs.com email.");
      else if (answer.status === "notAdded") emailError(`${address} isn’t added yet. Ask the person who manages the app to add it.`);
      else if (answer.status === "wrong") setError(`That code isn’t right. ${answer.triesLeft} ${answer.triesLeft === 1 ? "try" : "tries"} left.`);
      else if (answer.status === "expired" || answer.status === "noCode") {
        setStatus("expired"); setError("This code has expired. Codes work for 10 minutes. Send a new one and use the newest email.");
      } else if (answer.status === "tooMany") {
        setBlockedUntil(answeredAt + answer.minutes * 60_000);
        setError(`Too many tries. Wait ${answer.minutes} minutes, then send a new code.`);
      } else if (answer.status === "wait") {
        setResendAt(answeredAt + answer.seconds * 1000);
        setError(`A code was sent recently. Wait ${answer.seconds} seconds, then send a new code.`);
        // The first request may have landed even if its answer was lost.
        if (step === "email") { setEmail(address); setStep("code"); }
      } else throw new Error("Request unavailable");
    } catch {
      if (mounted.current) setError(kind === "send"
        ? "We couldn’t confirm the code was sent. Check your inbox, or try again shortly."
        : "We couldn’t sign you in. Try again. If the code was already used, send a new one.");
    } finally {
      clearTimeout(timeout);
      if (controller.current === abort) { controller.current = null; pending.current = false; if (mounted.current) setBusy(null); }
    }
  }

  function enter(index: number, value: string) {
    if (pending.current || blocked) return;
    const incoming = codeDigits(value);
    const nextDigits = [...digits];
    const start = incoming.length === 6 ? 0 : index;
    if (!incoming) nextDigits[index] = "";
    else [...incoming].forEach((digit, offset) => { if (start + offset < 6) nextDigits[start + offset] = digit; });
    setDigits(nextDigits); setError(""); setStatus("");
    inputs.current[Math.min(5, start + incoming.length)]?.focus();
    // Editing an earlier box in a rejected, still-filled code mustn't spend another try.
    if (nextDigits.every(Boolean) && start + incoming.length >= 6) void run("verify", nextDigits.join(""));
  }

  async function paste() {
    if (pending.current) return;
    pending.current = true; setBusy("paste");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const text = await Promise.race([
        navigator.clipboard.readText(),
        new Promise<string>((_, reject) => { timeout = setTimeout(() => reject(new Error("Clipboard did not answer")), 15_000); }),
      ]);
      if (!mounted.current) return;
      pending.current = false; setBusy(null);
      if (codeDigits(text).length !== 6) setError("Copy the 6-digit code from your email, then paste it here.");
      else enter(0, text);
    } catch {
      if (mounted.current) { pending.current = false; setBusy(null); setError("Paste into any code box, or type the six digits from your email."); }
    } finally { clearTimeout(timeout); }
  }

  const showInstall = ios && !anyway;
  const ready = session.ready && ios !== null;
  return <div className={styles.page}>
    <div className={styles.brand}><Image src="/brand/deus-mark.png" width={36} height={36} alt="" unoptimized />DEUS Team Space</div>
    <main className={styles.column}>
      <header className={styles.hero}>
        <h1>{step === "code" ? "Enter the code" : "Sign in"}</h1>
        <p>{showInstall ? "On iPhone, notifications only work in the app on your Home Screen, and it keeps its own sign-in."
          : step === "email" ? "Get notifications about your tasks: when someone gives you a task, and a summary at 09:00 on weekdays."
          : <>A 6-digit code is on its way to <b>{email}</b>. It works for 10 minutes.</>}</p>
      </header>
      {!ready || session.person ? <div className={styles.card} role="status">{online ? "Checking this device’s sign-in…" : "No connection. Connect to the internet to sign in."}</div>
        : session.error ? <div className={styles.card}><Notice tone={online ? "error" : "warning"}>{online ? "Couldn’t read this device’s sign-in. Try again." : "No connection. Connect to the internet to sign in."}</Notice><Button disabled={!online} onClick={retrySignInSession}>Try again</Button></div>
        : showInstall ? <div className={styles.card}>
          <Notice tone="inline" icon="install" title="Add DEUS Team Space to your Home Screen first,">then sign in there.</Notice>
          <HomeScreenSteps />
          <Button variant="quiet" onClick={() => setAnyway(true)}>Sign in here anyway</Button>
        </div> : <form className={styles.card} noValidate onSubmit={(event) => { event.preventDefault(); void run(step === "email" || status === "expired" ? "send" : "verify"); }}>
          {!online && <Notice tone="warning" title="No connection.">Connect to the internet to sign in.</Notice>}
          {step === "email" ? <>
            <Field label="Work email" error={fieldError} focusKey={emailErrorAttempt}>
              {(control) => <TextInput {...control} autoFocus type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="name@deushcs.com" value={email} disabled={!!busy} onChange={(event) => { setEmail(event.target.value); setFieldError(""); setError(""); setBlockedUntil(0); }} />}
            </Field>
            {error && <Notice tone={blocked ? "warning" : "error"}>{error}</Notice>}
            {!blocked && <Button type="submit" variant="main" busy={busy === "send"} busyLabel="Sending…" disabled={!online}>Send code</Button>}
            <p className={styles.hint}>We’ll email you a 6-digit code. No password needed.</p>
          </> : <>
            <fieldset className={styles.codes} disabled={!!busy || blocked || status === "expired"} aria-describedby={error ? "code-error" : undefined}>
              <legend className="sr-only">Code, 6 digits</legend>
              {digits.map((digit, index) => <TextInput key={index} ref={(element) => { inputs.current[index] = element; }} aria-label={`Digit ${index + 1}`} aria-invalid={!!error || undefined} aria-describedby={error ? "code-error" : undefined} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" value={digit}
                onFocus={(event) => event.target.select()} onChange={(event) => enter(index, event.target.value)}
                onPaste={(event) => { event.preventDefault(); enter(index, event.clipboardData.getData("text")); }}
                onKeyDown={(event) => {
                  if (event.key === "Backspace" && !digit && index > 0) { event.preventDefault(); inputs.current[index - 1]?.focus(); }
                  if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); inputs.current[index - 1]?.focus(); }
                  if (event.key === "ArrowRight" && index < 5) { event.preventDefault(); inputs.current[index + 1]?.focus(); }
                }} />)}
            </fieldset>
            {error && (status === "expired" || blocked
              ? <div id="code-error" role="alert"><Notice tone="warning">{error}</Notice></div>
              : <p id="code-error" className={styles.codeError} role="alert"><Icon name="alert" size={16} />{error}</p>)}
            <div className={styles.actions}>
              <Button small onClick={() => void paste()} busy={busy === "paste"} busyLabel="Pasting…" disabled={!!busy || blocked || !online || status === "expired"}>Paste code</Button>
              {remaining > 0 ? <span className={styles.hint}>Send a new code in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</span>
                : <Button variant="link" small onClick={() => void run("send")} busy={busy === "send"} busyLabel="Sending…" disabled={!!busy || blocked || !online}>Send a new code</Button>}
            </div>
            {!blocked && <Button type="submit" variant="main" busy={busy === "verify" || busy === "send"} busyLabel={busy === "send" ? "Sending…" : "Signing in…"} disabled={!online || (status === "expired" ? remaining > 0 : digits.some((digit) => !digit) || busy === "paste")}>{status === "expired" ? "Send a new code" : "Sign in"}</Button>}
            <p className={styles.hint}>Not in your inbox? Check spam. <Button variant="link" small disabled={!!busy} onClick={() => { setStep("email"); setDigits(emptyCode()); setError(""); setFieldError(""); setStatus(""); setBlockedUntil(0); setResendAt(0); }}>Use another email</Button></p>
            {status && status !== "expired" && <span className="sr-only" role="status">{status}</span>}
          </>}
        </form>}
      <Link className={styles.back} href={next}><Icon name="left" size={16} />Back to the app</Link>
    </main>
  </div>;
}
