import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Plus, Pencil, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useIncome, useCreateIncome, useUpdateIncome, useDeleteIncome, type UIIncomeInput } from "@/hooks/use-income";
import type { Income } from "@shared/schema";
import { cn } from "@/lib/utils";

const SOURCES: { value: UIIncomeInput["source"]; label: string; color: string }[] = [
  { value: "salary",     label: "Salary",     color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { value: "freelance",  label: "Freelance",  color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  { value: "investment", label: "Investment", color: "bg-green-500/10 text-green-600 dark:text-green-400" },
  { value: "other",      label: "Other",      color: "bg-muted text-muted-foreground" },
];

const fmt = (paise: number) =>
  (paise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" });

function IncomeModal({ initial, onClose }: { initial?: Income; onClose: () => void }) {
  const [form, setForm] = useState<UIIncomeInput>({
    amount: initial ? (initial.amount / 100).toString() : "",
    description: initial?.description ?? "",
    source: (initial?.source as UIIncomeInput["source"]) ?? "salary",
    date: initial?.date ?? format(new Date(), "yyyy-MM-dd"),
  });

  const createMutation = useCreateIncome();
  const updateMutation = useUpdateIncome();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (initial) {
      updateMutation.mutate({ id: initial.id, data: form }, { onSuccess: onClose });
    } else {
      createMutation.mutate(form, { onSuccess: onClose });
    }
  };

  return (
    <DialogContent className="sm:max-w-md rounded-3xl p-0 overflow-hidden border-border/50 bg-background/95 backdrop-blur-xl">
      <DialogHeader className="px-6 pt-6 pb-2">
        <DialogTitle className="text-center text-xl font-semibold">
          {initial ? "Edit Income" : "Add Income"}
        </DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-5">
        <div className="relative flex justify-center py-3">
          <div className="flex items-baseline justify-center">
            <span className="text-3xl font-medium text-muted-foreground mr-1 translate-y-[-2px]">₹</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) setForm(f => ({ ...f, amount: v }));
              }}
              className="w-48 text-5xl font-bold bg-transparent text-center focus:outline-none placeholder:text-muted/50 text-foreground"
              autoFocus
              required
            />
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border/50 overflow-hidden shadow-sm">
          <div className="flex items-center px-4 py-3 border-b border-border">
            <label className="w-24 text-[15px] font-medium text-foreground">For</label>
            <input
              type="text"
              placeholder="e.g. Monthly salary, Client payment"
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              className="flex-1 bg-transparent text-[15px] focus:outline-none text-foreground placeholder:text-muted-foreground"
              required
            />
          </div>
          <div className="flex items-center px-4 py-3">
            <label className="w-24 text-[15px] font-medium text-foreground">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
              className="flex-1 bg-transparent text-[15px] focus:outline-none text-foreground"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-[13px] uppercase tracking-wider font-semibold text-muted-foreground mb-3 px-1">
            Source
          </label>
          <div className="grid grid-cols-4 gap-2">
            {SOURCES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm(f => ({ ...f, source: value }))}
                className={cn(
                  "py-2 px-1 rounded-2xl border text-[12px] font-medium transition-all duration-200",
                  form.source === value
                    ? "bg-card border-primary/30 shadow-md scale-[1.02] text-foreground"
                    : "bg-transparent border-transparent hover:bg-card/50 text-muted-foreground opacity-60 hover:opacity-100"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Button
          type="submit"
          className="w-full rounded-xl py-6 text-[17px] font-semibold"
          disabled={isPending || !form.amount || !form.description}
        >
          {initial ? "Update Income" : "Save Income"}
        </Button>
      </form>
    </DialogContent>
  );
}

export default function IncomePage() {
  const { data: incomeList, isLoading } = useIncome();
  const deleteMutation = useDeleteIncome();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Income | null>(null);
  const [adding, setAdding] = useState(false);

  const totalThisMonth = (incomeList ?? []).filter(i => {
    const now = new Date();
    return i.date.startsWith(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  }).reduce((sum, i) => sum + i.amount, 0);

  const sourceLabel = (s: string) => SOURCES.find(x => x.value === s)?.label ?? s;
  const sourceBadge = (s: string) => SOURCES.find(x => x.value === s)?.color ?? "bg-muted text-muted-foreground";

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <header className="px-5 pt-12 pb-4 sticky top-0 bg-background/80 backdrop-blur-xl z-10 border-b border-transparent">
        <div className="max-w-2xl mx-auto flex justify-between items-end">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Income</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              This month: {fmt(totalThisMonth)}
            </p>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="bg-primary text-primary-foreground p-2 rounded-full shadow-md hover:bg-primary/90 transition-transform active:scale-95"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="px-4 max-w-2xl mx-auto mt-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-card rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (incomeList ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4 opacity-50">
              <Wallet className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No income recorded yet</h3>
            <p className="text-muted-foreground text-[15px]">Tap + to log your first income entry.</p>
          </div>
        ) : (
          <div className="ios-list">
            {(incomeList ?? []).map(item => (
              <div key={item.id} className="ios-list-item group">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
                  <Wallet className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="ios-list-content">
                  <div className="flex flex-col justify-center">
                    <span className="text-[16px] font-medium text-foreground leading-snug">
                      {item.description}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[13px] text-muted-foreground">
                        {format(parseISO(item.date), "MMM d")}
                      </span>
                      <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", sourceBadge(item.source))}>
                        {sourceLabel(item.source)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[16px] font-semibold text-green-600 dark:text-green-400">
                      +{fmt(item.amount)}
                    </span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditing(item)}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(item.id)}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <Dialog open={adding} onOpenChange={setAdding}>
        <IncomeModal onClose={() => setAdding(false)} />
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && <IncomeModal initial={editing} onClose={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}
