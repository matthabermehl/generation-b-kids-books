import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, CircleCheckBig, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api/client";
import { useParentFlow } from "@/lib/parent-flow";
import { useSession } from "@/lib/session";

export function LandingPage() {
  const navigate = useNavigate();
  const { loading, session, token } = useSession();
  const { refreshOrder, setBanner } = useParentFlow();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const checkoutOutcome = useMemo(() => new URL(window.location.href).searchParams.get("checkout"), []);

  useEffect(() => {
    if (!token || loading || !session) {
      return;
    }

    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("checkout");
    window.history.replaceState({}, "", cleanUrl.toString());

    if (checkoutOutcome === "success") {
      void refreshOrder().finally(() => {
        setBanner({
          tone: "success",
          title: "Checkout received",
          message: "Your order is back in the app. We will keep the build status updated here."
        });
        navigate("/books/current", { replace: true });
      });
      return;
    }

    if (checkoutOutcome === "cancel") {
      setBanner({
        tone: "info",
        title: "Checkout canceled",
        message: "Your order draft is still here. You can retry checkout when ready."
      });
      navigate("/checkout", { replace: true });
      return;
    }

    navigate("/create", { replace: true });
  }, [checkoutOutcome, loading, navigate, refreshOrder, session, setBanner, token]);

  const requestLink = async () => {
    if (!email.trim()) {
      setStatus("Enter your email to request a sign-in link.");
      return;
    }

    setSending(true);
    setStatus("");
    try {
      const response = await apiClient.requestLink(email.trim());
      if (response.sent) {
        setStatus("Magic link sent. Check your email to continue.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to send the sign-in link.");
    } finally {
      setSending(false);
    }
  };

  if (token && loading) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-6xl items-center justify-center">
        <Card className="w-full max-w-md border-border/70 bg-card/95">
          <CardHeader>
            <CardTitle>Loading your parent workspace</CardTitle>
            <CardDescription>We are reconnecting your session and restoring the active order.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">
            Parent-first picture books
          </div>
          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Personalized Bitcoin stories without turning the experience into an admin tool.
            </h1>
            <p className="max-w-2xl text-lg text-slate-600">
              Sign in, create a child-safe order, move through checkout, and come back to follow the book build from one
              calm parent workspace.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="border-border/70 bg-white/90">
              <CardHeader className="gap-3">
                <ShieldCheck className="size-5 text-slate-700" />
                <CardTitle className="text-sm font-semibold">Privacy-first</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                Parent email plus child first name, age, and interests only. No child photos.
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-white/90">
              <CardHeader className="gap-3">
                <Sparkles className="size-5 text-slate-700" />
                <CardTitle className="text-sm font-semibold">Structured flow</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                Separate steps for creation, checkout, and book delivery keep each decision focused.
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-white/90">
              <CardHeader className="gap-3">
                <BookOpen className="size-5 text-slate-700" />
                <CardTitle className="text-sm font-semibold">Live status</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                Watch order and book progress, load previews, and pull the PDF when it is ready.
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="border-border/70 bg-white/95 shadow-sm">
          <CardHeader className="space-y-2">
            <CardTitle>Parent sign-in</CardTitle>
            <CardDescription>Request a magic link to start or resume your active book flow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="parent@example.com"
              />
            </div>
            <Button onClick={requestLink} disabled={sending} className="w-full">
              <Mail className="size-4" />
              {sending ? "Sending magic link..." : "Send magic link"}
            </Button>
            {status ? (
              <Alert>
                <CircleCheckBig className="size-4" />
                <AlertTitle>Sign-in status</AlertTitle>
                <AlertDescription>{status}</AlertDescription>
              </Alert>
            ) : null}
            {checkoutOutcome && !token ? (
              <Alert>
                <ShieldCheck className="size-4" />
                <AlertTitle>Resume your checkout</AlertTitle>
                <AlertDescription>Sign in again and the app will route you back to the right step.</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
