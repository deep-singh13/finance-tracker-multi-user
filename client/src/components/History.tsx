import React, { useMemo, useState } from "react";
import { format, parseISO, startOfMonth, isSameMonth, eachMonthOfInterval } from "date-fns";
import { type ExpenseResponse } from "@shared/routes";
import { CategoryIcon } from "./CategoryIcon";
import { useExpenses, useDeleteExpense } from "@/hooks/use-expenses";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpenseModal } from "./ExpenseModal";
import { Input } from "@/components/ui/input";
import { Search, Trash2 } from "lucide-react";

/** Per-category surface tints for ios-list rows. Applied via --row-tint CSS custom property
 *  so the hover state can override cleanly. Opacity is intentionally sub-threshold: you
 *  can't name the color, but after 20 rows you scan by category without looking at the icon. */
const CATEGORY_TINTS: Record<string, string> = {
  Food:          "rgba(249,115,22,0.05)",
  Entertainment: "rgba(168,85,247,0.05)",
  Amenities:     "rgba(59,130,246,0.04)",
  Miscellaneous: "rgba(113,113,122,0.04)",
};

export function History() {
  const { data: expenses, isLoading } = useExpenses();
  const deleteExpense = useDeleteExpense();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingExpense, setEditingExpense] = useState<ExpenseResponse | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());

  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    return expenses.filter(exp =>
      exp.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      exp.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [expenses, searchQuery]);

  const months = useMemo(() => {
    if (!filteredExpenses.length) return [];
    const dates = filteredExpenses.map(e => parseISO(e.date).getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    return eachMonthOfInterval({ start: startOfMonth(minDate), end: startOfMonth(maxDate) })
      .sort((a, b) => b.getTime() - a.getTime());
  }, [filteredExpenses]);

  const formatAmount = (cents: number) =>
    (cents / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" });

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation(); // don't open edit modal
    setDeletingIds(prev => new Set(prev).add(id));
    // let the exit animation finish before the row leaves the DOM
    setTimeout(() => deleteExpense.mutate(id), 270);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 px-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-4">
            <Skeleton className="h-6 w-32 bg-muted/60 rounded-full" />
            <div className="ios-list">
              {[1, 2].map((j) => (
                <div key={j} className="ios-list-item">
                  <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
                  <div className="ios-list-content border-b-0">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-24" />
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

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <header className="px-5 pt-12 pb-4 sticky top-0 bg-background/80 backdrop-blur-xl z-10 border-b border-transparent transition-all">
        <div className="max-w-2xl mx-auto flex flex-col gap-4">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            History
          </h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 rounded-xl bg-card border-border/50 h-11"
            />
          </div>
        </div>
      </header>

      <main className="px-4 max-w-2xl mx-auto mt-6">
        <ExpenseModal
          expense={editingExpense || undefined}
          open={!!editingExpense}
          onOpenChange={(open) => !open && setEditingExpense(null)}
        />

        {months.map((monthDate) => {
          const monthExpenses = filteredExpenses.filter(e => isSameMonth(parseISO(e.date), monthDate));
          if (monthExpenses.length === 0) return null;
          const monthTotal = monthExpenses.reduce((sum, e) => sum + e.amount, 0);

          return (
            <div key={monthDate.toISOString()} className="mb-8 stagger-item">
              <div className="flex justify-between items-baseline px-2 mb-3">
                <h3 className="text-lg font-bold text-foreground">
                  {format(monthDate, "MMMM yyyy")}
                </h3>
                <span className="text-[13px] font-semibold text-foreground/65 tabular-nums uppercase tracking-wider">
                  {formatAmount(monthTotal)}
                </span>
              </div>

              <div className="ios-list">
                {monthExpenses
                  .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime())
                  .map((expense) => (
                    <div
                      key={expense.id}
                      className={`ios-list-item group cursor-pointer${deletingIds.has(expense.id) ? " row-exiting" : ""}`}
                      style={{ '--row-tint': CATEGORY_TINTS[expense.category] } as React.CSSProperties}
                      onClick={() => setEditingExpense(expense)}
                    >
                      <CategoryIcon category={expense.category} size="md" />

                      <div className="ios-list-content">
                        <div className="flex flex-col justify-center">
                          <span className="text-[16px] font-medium text-foreground leading-snug">
                            {expense.description}
                          </span>
                          <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
                            <span className="text-[13px] text-muted-foreground">
                              {format(parseISO(expense.date), "MMM d")} • {expense.category}
                            </span>
                            {expense.tags?.map(tag => (
                              <span key={tag} className="text-[11px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[16px] font-bold text-foreground tracking-tight">
                            {formatAmount(expense.amount)}
                          </span>
                          <button
                            onClick={(e) => handleDelete(e, expense.id)}
                            disabled={deleteExpense.isPending}
                            className="icon-btn w-8 h-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0"
                            style={{ transition: "opacity 150ms var(--ease-out), background-color 150ms var(--ease-out), color 150ms var(--ease-out), transform 120ms var(--ease-out)" }}
                            aria-label="Delete expense"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          );
        })}

        {filteredExpenses.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4 opacity-50">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No transactions found</h3>
            <p className="text-muted-foreground text-[15px]">
              Try searching for something else or log a new expense.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
