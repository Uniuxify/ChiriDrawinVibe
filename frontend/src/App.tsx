import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "./store/auth";
import LoginPage from "./features/auth/LoginPage";
import RegisterPage from "./features/auth/RegisterPage";
import SessionListPage from "./features/sessions/SessionListPage";
import SessionCreatePage from "./features/sessions/SessionCreatePage";
import SessionDetailPage from "./features/sessions/SessionDetailPage";
import CellEditorPage from "./features/editor/CellEditorPage";
import PublicListPage from "./features/viewer/PublicListPage";

function RequireAuth({ children }: { children: JSX.Element }) {
  const token = useAuthStore((s) => s.accessToken);
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/public" element={<PublicListPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <SessionListPage />
          </RequireAuth>
        }
      />
      <Route
        path="/sessions/new"
        element={
          <RequireAuth>
            <SessionCreatePage />
          </RequireAuth>
        }
      />
      <Route
        path="/sessions/:id/cells/:cellId"
        element={
          <RequireAuth>
            <CellEditorPage />
          </RequireAuth>
        }
      />
      <Route
        path="/sessions/:id"
        element={
          <RequireAuth>
            <SessionDetailPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}