import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

// Fetch all expenses
export function useExpenses() {
  return useQuery({
    queryKey: [api.expenses.list.path],
    queryFn: async () => {
      const res = await fetch(api.expenses.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch expenses");
      const data = await res.json();
      return api.expenses.list.responses[200].parse(data);
    },
  });
}

// UI Input type where amount is a string (e.g. "15.99") from the form
export interface UIExpenseInput {
  amount: string;
  description: string;
  category: string;
  date: string;
  tags?: string[];
}

// Create expense
export function useCreateExpense() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (uiData: UIExpenseInput) => {
      // Convert dollar string to cents integer
      const amountInCents = Math.round(parseFloat(uiData.amount) * 100);
      
      if (isNaN(amountInCents) || amountInCents <= 0) {
        throw new Error("Please enter a valid amount");
      }

      const payload = {
        ...uiData,
        amount: amountInCents,
        tags: uiData.tags ?? [],
      };

      const validated = api.expenses.create.input.parse(payload);
      
      const res = await fetch(api.expenses.create.path, {
        method: api.expenses.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to add expense");
      }

      return api.expenses.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.expenses.list.path] });
      toast({
        title: "Added successfully",
        description: "Your expense has been logged.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });
}

// Update expense
export function useUpdateExpense() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, uiData }: { id: number; uiData: UIExpenseInput }) => {
      const amountInCents = Math.round(parseFloat(uiData.amount) * 100);
      const payload = { ...uiData, amount: amountInCents };
      const validated = api.expenses.update.input.parse(payload);
      
      const url = buildUrl(api.expenses.update.path, { id });
      const res = await fetch(url, {
        method: api.expenses.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to update expense");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.expenses.list.path] });
      toast({ title: "Updated successfully" });
    },
  });
}

// Budget hooks
export function useBudget(month: string) {
  return useQuery({
    queryKey: ['/api/budgets', month],
    queryFn: async () => {
      const res = await fetch(`/api/budgets/${month}`);
      if (!res.ok) return null;
      return res.json();
    },
  });
}

export function useSetBudget() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ month, amount }: { month: string; amount: number }) => {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, amount: Math.round(amount * 100) }),
      });
      if (!res.ok) throw new Error("Failed to set budget");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/budgets', variables.month] });
      toast({ title: "Budget updated" });
    },
  });
}

// Delete expense
export function useDeleteExpense() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.expenses.delete.path, { id });
      const res = await fetch(url, { 
        method: api.expenses.delete.method, 
        credentials: "include" 
      });
      
      if (!res.ok) throw new Error("Failed to delete expense");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.expenses.list.path] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Could not delete this expense.",
        variant: "destructive",
      });
    }
  });
}
