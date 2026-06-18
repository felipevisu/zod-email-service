import { FormEvent, useState } from "react";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { Button, Card, Field, Input } from "../components/ui";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Invalid username or password."
          : "Could not sign in. Try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <div className="font-bold text-indigo-700 text-lg">✉ Email Service</div>
          <p className="text-sm text-slate-500 mt-1">Sign in to manage templates and logs</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Username">
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full justify-center">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
