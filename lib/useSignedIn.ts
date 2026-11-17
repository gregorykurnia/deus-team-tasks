"use client";

import { useSyncExternalStore } from "react";
import { signInEnabled } from "./flags";
import { signedInPerson, type SignedInPerson } from "./signInClient";

interface Session { person: SignedInPerson | null; ready: boolean; error: boolean }
const initial: Session = { person: null, ready: false, error: false };
let session = initial;
let started = false;
let revision = 0;
let initialization = 0;
let unsubscribeAuth: (() => void) | undefined;
const listeners = new Set<() => void>();
function publish(value: Session) { session = value; listeners.forEach((listener) => listener()); }

function subscribe(listener: () => void) {
  if (!signInEnabled()) return () => {};
  listeners.add(listener);
  startSession();
  return () => { listeners.delete(listener); };
}

function startSession() {
  if (!started && signInEnabled()) {
    started = true;
    const attempt = ++initialization;
    void Promise.all([import("firebase/auth"), import("./authClient")]).then(([{ onIdTokenChanged }, { clientAuth }]) => {
      if (attempt !== initialization) return;
      unsubscribeAuth = onIdTokenChanged(clientAuth, async (user) => {
        if (attempt !== initialization) return;
        const current = ++revision;
        try {
          const token = user ? await user.getIdTokenResult() : null;
          if (current === revision && attempt === initialization) publish({ person: user && token ? signedInPerson(user.uid, user.email, token.claims.name) : null, ready: true, error: false });
        } catch {
          if (current === revision && attempt === initialization) publish({ person: null, ready: true, error: true });
        }
      }, () => { if (attempt === initialization) { ++revision; publish({ person: null, ready: true, error: true }); } });
    }).catch(() => { if (attempt === initialization) { started = false; publish({ person: null, ready: true, error: true }); } });
  }
}

export function retrySignInSession() {
  if (!session.error) return;
  unsubscribeAuth?.(); unsubscribeAuth = undefined;
  ++revision; started = false;
  publish(initial); startSession();
}

export function useSignInSession(): Session {
  return useSyncExternalStore(subscribe, () => session, () => initial);
}
export function useSignedIn(): SignedInPerson | null { return useSignInSession().person; }

export async function acceptSignInToken(token: string): Promise<SignedInPerson> {
  const [{ signInWithCustomToken }, { clientAuth }] = await Promise.all([import("firebase/auth"), import("./authClient")]);
  const { user } = await signInWithCustomToken(clientAuth, token);
  const result = await user.getIdTokenResult();
  const person = signedInPerson(user.uid, user.email, result.claims.name);
  if (!person) throw new Error("Missing account details");
  return person;
}

export async function signOutDevice() {
  const [{ signOut }, { clientAuth }] = await Promise.all([import("firebase/auth"), import("./authClient")]);
  await signOut(clientAuth);
}
