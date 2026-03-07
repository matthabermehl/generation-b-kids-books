import { Link, Outlet } from "react-router-dom";
import { useSession } from "../lib/session";

export function AppLayout() {
  const { session, signOut } = useSession();
  const canReview = session?.capabilities.canReview ?? false;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AI Children's Book Builder</p>
          <h1>Calm, Personalized Bitcoin Stories</h1>
        </div>
        <nav className="topnav">
          <Link to="/">Parent</Link>
          {canReview ? <Link to="/review">Review</Link> : null}
          {session ? <button onClick={signOut}>Sign out</button> : null}
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
