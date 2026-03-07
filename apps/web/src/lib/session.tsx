import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiClient, ApiError, type SessionResponse } from "./api/client";
import { storageKeys } from "./storage";

interface SessionContextValue {
  token: string | null;
  session: SessionResponse | null;
  loading: boolean;
  setToken: (token: string | null) => void;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem(storageKeys.authToken));
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(() => Boolean(localStorage.getItem(storageKeys.authToken)));

  useEffect(() => {
    if (!token) {
      localStorage.removeItem(storageKeys.authToken);
      setSession(null);
      setLoading(false);
      return;
    }

    localStorage.setItem(storageKeys.authToken, token);
    setLoading(true);
    void apiClient
      .getSession(token)
      .then((payload) => {
        setSession(payload);
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          localStorage.removeItem(storageKeys.authToken);
          setTokenState(null);
          setSession(null);
          return;
        }
        throw error;
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  const value = useMemo<SessionContextValue>(
    () => ({
      token,
      session,
      loading,
      setToken: setTokenState,
      signOut: () => {
        localStorage.removeItem(storageKeys.authToken);
        setTokenState(null);
        setSession(null);
      }
    }),
    [loading, session, token]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside SessionProvider");
  }

  return context;
}
