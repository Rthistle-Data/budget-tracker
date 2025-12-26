import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Home from "./Home";
import Landing from "./pages/Landing";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Profile from "./pages/Profile";
import Why from "./pages/Why";

import RequireAuth from "./components/RequireAuth";

function AppShell({ children }) {
  return <div className="app-shell">{children}</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing is the default homepage */}
        <Route path="/" element={<Landing />} />

        {/* Optional: keep /landing as an alias */}
        <Route path="/landing" element={<Navigate to="/" replace />} />

        {/* Public */}
        <Route path="/why" element={<Why />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Private app */}
        <Route
          path="/app/*"
          element={
            <RequireAuth>
              <AppShell>
                <Home />
              </AppShell>
            </RequireAuth>
          }
        />

        <Route
          path="/profile"
          element={
            <RequireAuth>
              <AppShell>
                <Profile />
              </AppShell>
            </RequireAuth>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
