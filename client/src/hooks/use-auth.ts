import { useQuery, useQueryClient } from "@tanstack/react-query";

const AUTH_KEY = ["/api/auth/me"];

export function useAuth() {
  const { data, isLoading } = useQuery({
    queryKey: AUTH_KEY,
    queryFn: async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5 s timeout
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
          signal: controller.signal,
        });
        return res.ok;
      } catch {
        return false; // network error / timeout → show login
      } finally {
        clearTimeout(timeout);
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // re-check every 5 min
  });

  return {
    authenticated: data === true,
    isLoading,
  };
}

export function useLogout() {
  const qc = useQueryClient();

  return async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    // Invalidate auth state — App will show Login
    qc.setQueryData(AUTH_KEY, false);
    qc.clear();
  };
}
