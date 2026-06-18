import { Link, NavLink, Route, Routes } from "react-router-dom";
import CategoriesPage from "./pages/CategoriesPage";
import TemplatesPage from "./pages/TemplatesPage";
import TemplateDetailPage from "./pages/TemplateDetailPage";
import VersionEditorPage from "./pages/VersionEditorPage";
import SendersPage from "./pages/SendersPage";
import LogsPage from "./pages/LogsPage";

function Nav() {
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
      </div>
    </header>
  );
}

export default function App() {
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
        </Routes>
      </main>
    </div>
  );
}
