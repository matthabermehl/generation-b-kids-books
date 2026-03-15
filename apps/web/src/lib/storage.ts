import { useEffect, useState } from "react";

export const storageKeys = {
  authToken: "book-auth-token",
  activeOrder: "book-active-order",
  activeOrderStatus: "book-active-order-status",
  activeCharacterState: "book-active-character-state",
  activeCheckoutUrl: "book-active-checkout-url",
  activeBookPayload: "book-active-book-payload",
  activeDownloadUrl: "book-active-download-url"
} as const;

export function loadStoredJson<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

export function usePersistentState<T>(key: string, initialValue: T | null) {
  const [value, setValue] = useState<T | null>(() => loadStoredJson<T>(key) ?? initialValue);

  useEffect(() => {
    if (value === null) {
      localStorage.removeItem(key);
      return;
    }

    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}

export function usePersistentString(key: string) {
  const [value, setValue] = useState<string | null>(() => localStorage.getItem(key));

  useEffect(() => {
    if (!value) {
      localStorage.removeItem(key);
      return;
    }

    localStorage.setItem(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}
