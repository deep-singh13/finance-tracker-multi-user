import { useQuery, useQueryClient } from "@tanstack/react-query";

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
  const qc = useQueryClient();
  return async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    // Drop all cached per-user data, then synchronously write the logged-out auth
    // state. setQueryData notifies the mounted useAuth observer immediately, so the
    // AuthGuard re-renders to the login screen without a manual refresh. (clear() +
    // invalidate left the observer showing its last authenticated snapshot.)
    qc.clear();
    qc.setQueryData<AuthState>(AUTH_KEY, { authenticated: false, username: null, role: null, needsBootstrap: false });
  };
}
