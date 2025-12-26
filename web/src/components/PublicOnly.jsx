import { Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { me } from "../api";

export default function PublicOnly({ children, redirectTo = "/app" }) {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await me();
        if (!alive) return;
        setLoggedIn(true);
      } catch {
        if (!alive) return;
        setLoggedIn(false);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (loading) return (
  <div className="min-h-screen grid place-items-center text-white/70">
    Loading…
  </div>
);

  if (loggedIn) return <Navigate to={redirectTo} replace />;

  return children;
}
