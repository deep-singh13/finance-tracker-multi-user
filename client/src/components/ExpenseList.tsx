import { useMemo, useState } from "react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { Trash2, Copy, Search } from "lucide-react";
import { type ExpenseResponse } from "@shared/routes";
import { CategoryIcon } from "./CategoryIcon";
import { useDeleteExpense, useCreateExpense } from "@/hooks/use-expenses";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpenseModal } from "./ExpenseModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GmailSyncButton } from "./GmailSyncButton";

interface ExpenseListProps {
  expenses: ExpenseResponse[] | undefined;
  isLoading: boolean;
}

export function ExpenseList({ expenses, isLoading }: ExpenseListProps) {
  const deleteMutation = useDeleteExpense();
  const createMutation = useCreateExpense();
  const [editingExpense, setEditingExpense] = useState<ExpenseResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    return expenses.filter(exp => 
      exp.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      exp.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [expenses, searchQuery]);

  // Group expenses by date
  const groupedExpenses = useMemo(() => {
    if (!filteredExpenses) return {};
    
    const sorted = [...filteredExpenses].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateA !== dateB) return dateB - dateA;
      return b.id - a.id;
    });

    return sorted.reduce((acc, expense) => {
      const date = expense.date; // YYYY-MM-DD
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(expense);
      return acc;
    }, {} as Record<string, ExpenseResponse[]>);
  }, [filteredExpenses]);

  const handleDuplicate = (e: React.MouseEvent, expense: ExpenseResponse) => {
    e.stopPropagation();
    createMutation.mutate({
      amount: (expense.amount / 100).toString(),
      description: expense.description,
      category: expense.category,
      date: format(new Date(), "yyyy-MM-dd")
    });
  };

  const handleExportCSV = () => {
    if (!expenses) return;
    const headers = ["Date", "Amount", "Category", "Description"];
    const csvContent = [
      headers.join(","),
      ...expenses.map(e => [e.date, (e.amount/100).toFixed(2), e.category, `"${e.description}"`].join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `expenses_${format(new Date(), "yyyy-MM-dd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatGroupHeader = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "EEEE, MMM d");
  };

  const formatAmount = (cents: number) => {
    return (cents / 100).toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 mt-6">
        {[1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-5 w-24 ml-4 bg-muted/60 rounded-full" />
            <div className="ios-list">
              {[1, 2, 3].map((j) => (
                <div key={j} className="ios-list-item">
                  <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                  <div className="ios-list-content border-b-0">
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!expenses || expenses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4 opacity-50">
          <span className="text-3xl">💸</span>
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-1">No expenses yet</h3>
        <p className="text-muted-foreground text-[15px] max-w-[250px]">
          Tap the + button to start logging your daily spends.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 mt-6 pb-24">
      <div className="px-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search expenses..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 rounded-xl bg-card border-border/50"
          />
        </div>
        <GmailSyncButton />
        <Button
          variant="outline"
          onClick={handleExportCSV}
          className="w-full rounded-xl border-border/50 text-[13px] font-semibold"
        >
          Export CSV
        </Button>
        <ExpenseModal>
          <Button
            variant="default"
            className="w-full rounded-xl text-[13px] font-semibold"
          >
            Add Expense
          </Button>
        </ExpenseModal>
      </div>

      <ExpenseModal 
        expense={editingExpense || undefined} 
        open={!!editingExpense} 
        onOpenChange={(open) => !open && setEditingExpense(null)} 
      />

      {Object.entries(groupedExpenses).map(([dateStr, dayExpenses]) => (
        <div key={dateStr} className="space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-baseline px-4">
            <h3 className="text-[13px] uppercase tracking-widest font-semibold text-muted-foreground">
              {formatGroupHeader(dateStr)}
            </h3>
            <span className="text-[13px] font-medium text-muted-foreground">
              {formatAmount(dayExpenses.reduce((sum, e) => sum + e.amount, 0))}
            </span>
          </div>
          
          <div className="ios-list">
            {dayExpenses.map((expense) => (
              <div 
                key={expense.id} 
                className="ios-list-item group cursor-pointer"
                onClick={() => setEditingExpense(expense)}
              >
                <CategoryIcon category={expense.category} size="md" />
                
                <div className="ios-list-content">
                  <div className="flex flex-col justify-center">
                    <span className="text-[16px] font-medium text-foreground leading-snug">
                      {expense.description}
                    </span>
                    <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
                      <span className="text-[13px] text-muted-foreground">{expense.category}</span>
                      {expense.tags?.map(tag => (
                        <span key={tag} className="text-[11px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className="text-[16px] font-semibold text-foreground tracking-tight">
                      {formatAmount(expense.amount)}
                    </span>
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleDuplicate(e, expense)}
                        className="p-2 text-muted-foreground hover:bg-muted/10 rounded-full shrink-0"
                        aria-label="Duplicate"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMutation.mutate(expense.id);
                        }}
                        disabled={deleteMutation.isPending}
                        className="p-2 text-destructive hover:bg-destructive/10 rounded-full shrink-0 disabled:opacity-50"
                        aria-label="Delete expense"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
