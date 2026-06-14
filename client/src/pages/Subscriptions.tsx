import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CategoryIcon } from "@/components/CategoryIcon";
import type { Subscription } from "@shared/schema";

const CATEGORIES = ["Entertainment", "Utilities", "Health", "Food", "Shopping", "Transport", "Travel", "Other"];

const fmt = (paise: number) =>
  (paise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" });

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

interface FormState {
  name: string;
  amount: string;
  billingDay: string;
  category: string;
}

const emptyForm: FormState = { name: "", amount: "", billingDay: "1", category: "Entertainment" };

function SubscriptionModal({
  initial,
  onClose,
}: {
  initial?: Subscription;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          name: initial.name,
          amount: (initial.amount / 100).toString(),
          billingDay: initial.billingDay.toString(),
          category: initial.category,
        }
      : emptyForm
  );
  const qc = useQueryClient();
  const { toast } = useToast();

  const save = useMutation({
    mutationFn: async () => {
      const url = initial ? `/api/subscriptions/${initial.id}` : "/api/subscriptions";
      const method = initial ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: parseFloat(form.amount),
          billingDay: parseInt(form.billingDay),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/subscriptions"] });
      toast({ title: initial ? "Subscription updated" : "Subscription added" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-card rounded-2xl w-full max-w-md p-6 space-y-4 shadow-xl border border-border/50">
        <h2 className="text-lg font-bold">{initial ? "Edit Subscription" : "Add Subscription"}</h2>

        <div className="space-y-3">
          <Input placeholder="Name (e.g. Netflix, Spotify)" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="rounded-xl" />

          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
            <Input type="number" placeholder="Monthly amount" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="rounded-xl pl-7" />
          </div>

          <div className="space-y-1">
            <label className="text-[12px] text-muted-foreground pl-1">Billing day of month (1–28)</label>
            <Input type="number" min={1} max={28} placeholder="1" value={form.billingDay}
              onChange={e => setForm(f => ({ ...f, billingDay: e.target.value }))} className="rounded-xl" />
          </div>

          <div className="space-y-1">
            <label className="text-[12px] text-muted-foreground pl-1">Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <button key={c} type="button"
                  onClick={() => setForm(f => ({ ...f, category: c }))}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors
                    ${form.category === c ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-[12px] text-muted-foreground bg-muted/50 rounded-xl px-3 py-2">
          An expense will be automatically added on the {ordinal(parseInt(form.billingDay) || 1)} of each month while this subscription is active.
        </p>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 rounded-xl" disabled={!form.name || !form.amount || save.isPending}
            onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Subscriptions() {
  const { data: subs = [], isLoading } = useQuery<Subscription[]>({
    queryKey: ["/api/subscriptions"],
    queryFn: async () => {
      const res = await fetch("/api/subscriptions", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
  });
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modal, setModal] = useState<"add" | Subscription | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await fetch(`/api/subscriptions/${id}`, { method: "DELETE" }); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/subscriptions"] });
      toast({ title: "Subscription removed. It will no longer be added to monthly expenses." });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`/api/subscriptions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/subscriptions"] }),
  });

  const activeSubs = subs.filter(s => s.isActive);
  const monthlyTotal = activeSubs.reduce((sum, s) => sum + s.amount, 0);
  const currentMonth = format(new Date(), "MMMM yyyy");

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      {modal && (
        <SubscriptionModal
          initial={modal === "add" ? undefined : modal}
          onClose={() => setModal(null)}
        />
      )}

      <header className="px-5 pt-12 pb-4 sticky top-0 bg-background/80 backdrop-blur-xl z-10 border-b border-transparent">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">Subscriptions</h1>
          <button type="button"
            onClick={() => setModal("add")}
            className="bg-primary text-primary-foreground p-2 rounded-full shadow-md hover:bg-primary/90 transition-transform active:scale-95">
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="px-4 max-w-2xl mx-auto mt-4 space-y-4">
        {/* Summary card */}
        <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-sm">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Monthly Subscriptions
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-lg text-muted-foreground">₹</span>
            <span className="text-2xl font-bold">{(monthlyTotal / 100).toLocaleString("en-IN")}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[12px] text-muted-foreground">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{activeSubs.length} active · auto-added as expenses each month</span>
          </div>
        </div>

        {/* How it works note */}
        {subs.length > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-[13px] text-muted-foreground">
            Active subscriptions are automatically added as expenses on their billing day each month. Removing a subscription stops it from the <strong>{currentMonth}</strong> billing onwards.
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-card rounded-2xl animate-pulse border border-border/50" />)}
          </div>
        ) : subs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4 opacity-50">
              <RefreshCw className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No subscriptions yet</h3>
            <p className="text-muted-foreground text-[15px] max-w-[260px]">Add Netflix, Spotify, or any recurring subscription to track them automatically.</p>
          </div>
        ) : (
          <div className="ios-list">
            {subs.map(sub => (
              <div key={sub.id} className="ios-list-item group">
                <CategoryIcon category={sub.category} size="md" />

                <div className="ios-list-content">
                  <div className="flex flex-col justify-center min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[16px] font-medium truncate">{sub.name}</span>
                      {!sub.isActive && (
                        <span className="text-[11px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted shrink-0">Paused</span>
                      )}
                    </div>
                    <span className="text-[13px] text-muted-foreground mt-0.5">
                      {sub.category} · bills on {ordinal(sub.billingDay)} of month
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[16px] font-semibold">{fmt(sub.amount)}</span>

                    {/* Active toggle */}
                    <button
                      onClick={() => toggleMutation.mutate({ id: sub.id, isActive: !sub.isActive })}
                      className={`w-11 h-6 rounded-full transition-colors shrink-0 ${sub.isActive ? "bg-primary" : "bg-muted"}`}
                      title={sub.isActive ? "Pause subscription" : "Resume subscription"}>
                      <span className={`block w-5 h-5 bg-white rounded-full shadow-sm mx-0.5 transition-transform ${sub.isActive ? "translate-x-5" : "translate-x-0"}`} />
                    </button>

                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setModal(sub)} className="p-1.5 text-muted-foreground hover:bg-muted/20 rounded-full">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteMutation.mutate(sub.id)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded-full">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Desktop FAB */}
      <div className="hidden md:block fixed bottom-24 right-8 z-[60]">
        <button type="button" onClick={() => setModal("add")}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-4 rounded-full shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 font-semibold text-lg">
          <Plus className="w-6 h-6" /> Add Subscription
        </button>
      </div>
    </div>
  );
}
