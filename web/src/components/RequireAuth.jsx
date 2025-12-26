import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { me } from "../api";

export default function RequireAuth({ children }) {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await me(); // should throw / fail if not logged in
        if (!alive) return;
        setOk(true);
      } catch {
        if (!alive) return;
        setOk(false);
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

  if (!ok) return <Navigate to="/login" replace state={{ from: location }} />;

  return children;
}
