import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Income } from "@shared/schema";

const INCOME_KEY = "/api/income";

export function useIncome() {
  return useQuery<Income[]>({
    queryKey: [INCOME_KEY],
    queryFn: async () => {
      const res = await fetch(INCOME_KEY, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch income");
      return res.json();
    },
  });
}

export interface UIIncomeInput {
  amount: string;
  description: string;
  source: "salary" | "freelance" | "investment" | "other";
  date: string;
}

export function useCreateIncome() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: UIIncomeInput) => {
      const res = await fetch(INCOME_KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, amount: parseFloat(data.amount) }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to add income");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [INCOME_KEY] });
      toast({ title: "Income added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateIncome() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<UIIncomeInput> }) => {
      const body: Record<string, unknown> = { ...data };
      if (data.amount !== undefined) body.amount = parseFloat(data.amount);
      const res = await fetch(`/api/income/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update income");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [INCOME_KEY] });
      toast({ title: "Income updated" });
    },
  });
}

export function useDeleteIncome() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/income/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete income");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [INCOME_KEY] });
    },
    onError: () => toast({ title: "Error", description: "Could not delete income", variant: "destructive" }),
  });
}
