import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getMe, logout, type Me } from "@/lib/auth.functions";
import type { Role } from "./permissions";

export type Profile = {
  id: string;
  name: string;
  email: string;
  system_access: boolean;
  active: boolean;
};

/** Mesmo formato que as telas já usavam (session.user.id / .email). */
export type Session = { user: { id: string; email: string } };

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  role: Role | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setMe(await getMe());
    } catch {
      // Falha passageira: mantém o estado atual para a tela não piscar "Acesso indisponível".
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Outra aba entrou/saiu, ou a sessão expirou: o servidor avisa pelo evento abaixo.
    const onChange = () => void refresh();
    window.addEventListener("auth:changed", onChange);
    return () => window.removeEventListener("auth:changed", onChange);
  }, [refresh]);

  const value: AuthState = {
    session: me ? { user: me.user } : null,
    profile: me?.profile ?? null,
    role: (me?.role as Role | null) ?? null,
    loading,
    refresh,
    signOut: async () => {
      try {
        await logout();
      } finally {
        setMe(null);
      }
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Avisa o AuthProvider para reler a sessão (ex.: depois do login ou quando o servidor recusa por sessão expirada). */
export function notifyAuthChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("auth:changed"));
}
