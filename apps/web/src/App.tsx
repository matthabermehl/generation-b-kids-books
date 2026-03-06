import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { SessionProvider, useSession } from "./lib/session";
import { ParentHomePage } from "./routes/ParentHomePage";
import { ReviewCasePage } from "./routes/ReviewCasePage";
import { ReviewQueuePage } from "./routes/ReviewQueuePage";
import { VerifyPage } from "./routes/VerifyPage";

function RequireReviewer({ children }: { children: React.ReactNode }) {
  const { loading, session, token } = useSession();
  if (loading || (token && !session)) {
    return <main className="route-wrap"><p className="hint">Loading session…</p></main>;
  }

  if (!session?.capabilities.canReview) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<ParentHomePage />} />
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
    </SessionProvider>
  );
}
