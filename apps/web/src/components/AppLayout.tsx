import { Link, Outlet } from "react-router-dom";
import { BookOpenText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useParentFlow } from "@/lib/parent-flow";
import { useSession } from "../lib/session";

export function AppLayout() {
  const { session, signOut } = useSession();
  const { clearFlowState } = useParentFlow();
  const canReview = session?.capabilities.canReview ?? false;

  return (
    <div className="sw-shell min-h-screen bg-background text-foreground">
      <header className="sw-header sticky top-0 z-20 border-b border-border/80 bg-background/95 backdrop-blur">
        <div className="sw-container sw-header-bar mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="sw-brand flex items-center gap-3 text-sm no-underline">
            <span className="sw-brand-mark flex size-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <BookOpenText className="size-5" />
            </span>
            <span className="sw-brand-copy space-y-0.5">
              <span className="sw-brand-kicker block text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">
                AI Children's Book Builder
              </span>
              <span className="sw-brand-name block text-base font-semibold text-slate-950">Bitcoin story workspace</span>
            </span>
          </Link>
          <nav className="sw-nav flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="sw-nav-link">
              <Link to="/">Parent</Link>
            </Button>
            {canReview ? (
              <Button asChild variant="ghost" size="sm" className="sw-nav-link">
                <Link to="/review">Review</Link>
              </Button>
            ) : null}
            {session ? (
              <Button
                variant="outline"
                size="sm"
                className="sm:min-w-[8.5rem]"
                onClick={() => {
                  clearFlowState();
                  signOut();
                }}
              >
                Sign out
              </Button>
            ) : null}
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
