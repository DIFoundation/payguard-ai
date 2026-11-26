import { useSyncExternalStore } from "react";
import type { PaymentRecord, SavedRecipient } from "@/types";

const PREFIX = "payguard:";
const KEYS = {
  recipients: `${PREFIX}recipients`,
  history: `${PREFIX}history`,
  prefs: `${PREFIX}prefs`,
  lastVerification: `${PREFIX}lastVerification`,
} as const;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// ---- Reactive local storage (safe for SSR via useSyncExternalStore) ----
const listeners = new Set<() => void>();
let version = 0;
const snapshotCache = new Map<string, { version: number; value: unknown }>();

export function subscribeLocalStorage(cb: () => void): () => void {
  listeners.add(cb);
  if (typeof window !== "undefined") window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", cb);
  };
}

function notify(): void {
  version += 1;
  listeners.forEach((l) => l());
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    notify();
  } catch {
    // storage full or unavailable — fail silently
  }
}

/** Cached snapshot getter keyed by storage version (getSnapshot must be stable). */
function cached<T>(key: string, compute: () => T): T {
  const hit = snapshotCache.get(key);
  if (hit && hit.version === version) return hit.value as T;
  const value = compute();
  snapshotCache.set(key, { version, value });
  return value;
}

export function usePaymentHistory(): PaymentRecord[] {
  return useSyncExternalStore(
    subscribeLocalStorage,
    () => cached("history", getPaymentHistory),
    () => EMPTY_HISTORY,
  );
}

export function useSavedRecipients(): SavedRecipient[] {
  return useSyncExternalStore(
    subscribeLocalStorage,
    () => cached("recipients", getSavedRecipients),
    () => EMPTY_RECIPIENTS,
  );
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(
    subscribeLocalStorage,
    () => cached("prefs", getPreferences),
    () => ({ theme: "dark" }),
  );
}

const EMPTY_HISTORY: PaymentRecord[] = [];
const EMPTY_RECIPIENTS: SavedRecipient[] = [];

// ---- Saved recipients ----
export function getSavedRecipients(): SavedRecipient[] {
  return read<SavedRecipient[]>(KEYS.recipients, []);
}

export function saveRecipient(address: string, label: string): void {
  const list = getSavedRecipients();
  const existing = list.find(
    (r) => r.address.toLowerCase() === address.toLowerCase(),
  );
  if (existing) {
    existing.label = label || existing.label;
    existing.lastSeenAt = Date.now();
  } else {
    list.push({ address, label, addedAt: Date.now(), lastSeenAt: Date.now() });
  }
  write(KEYS.recipients, list.slice(0, 100));
}

export function removeRecipient(address: string): void {
  write(
    KEYS.recipients,
    getSavedRecipients().filter(
      (r) => r.address.toLowerCase() !== address.toLowerCase(),
    ),
  );
}

// ---- Payment history ----
export function getPaymentHistory(): PaymentRecord[] {
  return read<PaymentRecord[]>(KEYS.history, []);
}

export function addPaymentRecord(record: PaymentRecord): void {
  const list = [record, ...getPaymentHistory()].slice(0, 200);
  write(KEYS.history, list);
}

export function updatePaymentRecord(id: string, patch: Partial<PaymentRecord>): void {
  write(
    KEYS.history,
    getPaymentHistory().map((r) => (r.id === id ? { ...r, ...patch } : r)),
  );
}

// ---- Preferences ----
export interface Preferences {
  theme: "dark" | "light";
}

export function getPreferences(): Preferences {
  return read<Preferences>(KEYS.prefs, { theme: "dark" });
}

export function setPreferences(prefs: Preferences): void {
  write(KEYS.prefs, prefs);
}

// ---- Last verification (cached display only; never trusted as evidence) ----
export function getLastVerification(): unknown {
  return read(KEYS.lastVerification, null);
}

export function setLastVerification(value: unknown): void {
  write(KEYS.lastVerification, value);
}
