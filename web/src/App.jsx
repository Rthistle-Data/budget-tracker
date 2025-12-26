import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router-dom";

import Home from "./Home";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Profile from "./pages/Profile";
import Why from "./pages/Why";
import Landing from "./pages/Landing";

import RequireAuth from "./components/RequireAuth";
import PublicOnly from "./components/PublicOnly";

function AppLayout() {
  return (
    <div className="app-shell">
      <Outlet />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          {/* Public (but redirect to /app if already logged in) */}
          <Route
            path="/"
            element={
              <PublicOnly redirectTo="/app">
                <Landing />
              </PublicOnly>
            }
          />

          {/* Public */}
          <Route path="/why" element={<Why />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Private */}
          <Route
            path="/app/*"
            element={
              <RequireAuth>
                <Home />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <Profile />
              </RequireAuth>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
