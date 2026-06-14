import { useQuery } from "@tanstack/react-query";

const AUTH_KEY = ["/api/auth/me"];

export interface AuthState {
  authenticated: boolean;
  username: string | null;
  role: "user" | "admin" | null;
  needsBootstrap: boolean;
}

export function useAuth() {
  const { data, isLoading } = useQuery<AuthState>({
    queryKey: AUTH_KEY,
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        const body = await res.json().catch(() => ({}));
        if (res.ok) return { authenticated: true, username: body.username, role: body.role, needsBootstrap: false };
        return { authenticated: false, username: null, role: null, needsBootstrap: !!body.needsBootstrap };
      } catch {
        return { authenticated: false, username: null, role: null, needsBootstrap: false };
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return {
    authenticated: data?.authenticated ?? false,
    username: data?.username ?? null,
    role: data?.role ?? null,
    needsBootstrap: data?.needsBootstrap ?? false,
    isLoading,
  };
}

export function useLogout() {
  return async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      // Hard redirect to the root: the app reboots, /api/auth/me returns 401, and
      // the login screen shows. This is bulletproof — it doesn't depend on React
      // Query re-notifying the mounted auth observer — and it wipes all in-memory
      // per-user state for free.
      window.location.href = "/";
    }
  };
}
