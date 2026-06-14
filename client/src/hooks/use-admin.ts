import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface AdminUser {
  id: number; username: string; role: "user" | "admin";
  createdAt: string; lastLoginAt: string | null;
  expenseCount: number; incomeCount: number;
}

const KEY = ["/api/admin/users"];
async function jsonFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Request failed");
  return res.status === 204 ? null : res.json();
}

export function useAdminUsers() {
  return useQuery<AdminUser[]>({ queryKey: KEY, queryFn: () => jsonFetch("/api/admin/users") });
}

export function useAdminMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });
  return {
    createUser: useMutation({ mutationFn: (v: { username: string; password: string }) => jsonFetch("/api/admin/users", { method: "POST", body: JSON.stringify(v) }), onSuccess: invalidate }),
    deleteUser: useMutation({ mutationFn: (id: number) => jsonFetch(`/api/admin/users/${id}`, { method: "DELETE" }), onSuccess: invalidate }),
    resetPassword: useMutation({ mutationFn: (v: { id: number; password: string }) => jsonFetch(`/api/admin/users/${v.id}/password`, { method: "PUT", body: JSON.stringify({ password: v.password }) }), onSuccess: invalidate }),
    setRole: useMutation({ mutationFn: (v: { id: number; role: "user" | "admin" }) => jsonFetch(`/api/admin/users/${v.id}/role`, { method: "PUT", body: JSON.stringify({ role: v.role }) }), onSuccess: invalidate }),
  };
}
