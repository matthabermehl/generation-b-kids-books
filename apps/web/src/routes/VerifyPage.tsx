import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleCheckBig, Link2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <main className="sw-page sw-container mx-auto flex min-h-[calc(100vh-8rem)] max-w-4xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <Card className="sw-panel w-full max-w-xl border-border/70 bg-white/95">
        <CardHeader>
          <h1 className="text-2xl font-semibold text-slate-950">Verify sign-in</h1>
          <CardDescription>We are exchanging the magic link for a parent session.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            {status.toLowerCase().includes("verified") ? <CircleCheckBig className="size-4" /> : <Link2 className="size-4" />}
            <AlertTitle>Verification status</AlertTitle>
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </main>
  );
}
