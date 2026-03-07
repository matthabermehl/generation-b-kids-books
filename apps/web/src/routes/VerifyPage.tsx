import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../lib/api/client";
import { useSession } from "../lib/session";

export function VerifyPage() {
  const navigate = useNavigate();
  const { setToken } = useSession();
  const [status, setStatus] = useState("Verifying your sign-in link...");
  const tokenFromUrl = useMemo(() => new URL(window.location.href).searchParams.get("token"), []);

  useEffect(() => {
    if (!tokenFromUrl) {
      setStatus("Verification token missing.");
      return;
    }

    void apiClient
      .verifyLink(tokenFromUrl)
      .then((payload) => {
        setToken(payload.token);
        setStatus("Email verified. Redirecting...");
        navigate("/", { replace: true });
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : "Verification failed");
      })
      .finally(() => {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("token");
        window.history.replaceState({}, "", cleanUrl.toString());
      });
  }, [navigate, setToken, tokenFromUrl]);

  return (
    <main className="route-wrap narrow">
      <section className="card">
        <h2>Verify Sign-in</h2>
        <p className="hint">{status}</p>
      </section>
    </main>
  );
}
