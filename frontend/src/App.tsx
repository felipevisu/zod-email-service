import { Link, NavLink, Route, Routes } from "react-router-dom";
import CategoriesPage from "./pages/CategoriesPage";
import TemplatesPage from "./pages/TemplatesPage";
import TemplateDetailPage from "./pages/TemplateDetailPage";
import VersionEditorPage from "./pages/VersionEditorPage";
import SendersPage from "./pages/SendersPage";
import LogsPage from "./pages/LogsPage";
import ApiKeysPage from "./pages/ApiKeysPage";
import LoginPage from "./pages/LoginPage";
import { useAuth } from "./lib/auth";

function Nav() {
  const { user, logout } = useAuth();
  const cls = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium ${
      isActive ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-200"
    }`;
  return (
    <header className="border-b bg-white">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-2">
        <Link to="/" className="font-bold text-indigo-700 mr-4">
          ✉ Email Service
        </Link>
        <NavLink to="/" end className={cls}>
          Emails
        </NavLink>
        <NavLink to="/senders" className={cls}>
          Senders
        </NavLink>
        <NavLink to="/logs" className={cls}>
          Logs
        </NavLink>
        <NavLink to="/api-keys" className={cls}>
          API keys
        </NavLink>
        <div className="ml-auto flex items-center gap-3 text-sm text-slate-500">
          <span className="hidden sm:inline">{user?.username}</span>
          <button
            onClick={() => logout()}
            className="px-3 py-2 rounded-md font-medium text-slate-600 hover:bg-slate-200"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
        Loading…
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route path="/" element={<CategoriesPage />} />
          <Route path="/categories/:categoryId" element={<TemplatesPage />} />
          <Route path="/templates/:templateId" element={<TemplateDetailPage />} />
          <Route path="/versions/:versionId" element={<VersionEditorPage />} />
          <Route path="/senders" element={<SendersPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/api-keys" element={<ApiKeysPage />} />
        </Routes>
      </main>
    </div>
  );
}
