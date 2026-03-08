import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { CurrentBookPage } from "./routes/CurrentBookPage";
import { CheckoutPage } from "./routes/CheckoutPage";
import { CreateOrderPage } from "./routes/CreateOrderPage";
import { LandingPage } from "./routes/LandingPage";
import { ParentFlowProvider, useParentFlow } from "./lib/parent-flow";
import { SessionProvider, useSession } from "./lib/session";
import { ReviewCasePage } from "./routes/ReviewCasePage";
import { ReviewQueuePage } from "./routes/ReviewQueuePage";
import { VerifyPage } from "./routes/VerifyPage";

function LoadingState({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-6xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <p className="text-sm text-slate-500">{message}</p>
    </main>
  );
}

function RequireSession() {
  const { loading, session, token } = useSession();
  if (loading || (token && !session)) {
    return <LoadingState message="Loading your session…" />;
  }

  if (!session) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

function RequireActiveOrder() {
  const { hasActiveOrder } = useParentFlow();
  if (!hasActiveOrder) {
    return <Navigate to="/create" replace />;
  }

  return <Outlet />;
}

function RequireReviewer({ children }: { children: React.ReactNode }) {
  const { loading, session, token } = useSession();
  if (loading || (token && !session)) {
    return <LoadingState message="Loading reviewer session…" />;
  }

  if (!session?.capabilities.canReview) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <SessionProvider>
      <ParentFlowProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<LandingPage />} />
              <Route element={<RequireSession />}>
                <Route path="/create" element={<CreateOrderPage />} />
                <Route element={<RequireActiveOrder />}>
                  <Route path="/checkout" element={<CheckoutPage />} />
                  <Route path="/books/current" element={<CurrentBookPage />} />
                </Route>
              </Route>
              <Route path="/verify" element={<VerifyPage />} />
              <Route
                path="/review"
                element={
                  <RequireReviewer>
                    <ReviewQueuePage />
                  </RequireReviewer>
                }
              />
              <Route
                path="/review/cases/:caseId"
                element={
                  <RequireReviewer>
                    <ReviewCasePage />
                  </RequireReviewer>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ParentFlowProvider>
    </SessionProvider>
  );
}
