import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { auth, AuthUser } from "./api";

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Bootstrap: ask the server who we are (valid session cookie?).
  useEffect(() => {
    auth
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // Any 401 from the API drops us back to the login screen.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener("auth:unauthorized", onUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", onUnauthorized);
  }, []);

  const value: AuthState = {
    user,
    loading,
    login: async (username, password) => setUser(await auth.login(username, password)),
    logout: async () => {
      await auth.logout();
      setUser(null);
    },
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
