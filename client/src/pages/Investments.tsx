import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, differenceInMonths } from "date-fns";
import { Plus, Pencil, Trash2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { Investment } from "@shared/schema";

const INVESTMENT_TYPES = ["SIP", "Lump Sum", "FD", "PPF", "NPS", "Other"];

const TYPE_COLORS: Record<string, string> = {
  SIP: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "Lump Sum": "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  FD: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  PPF: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  NPS: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  Other: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

const fmt = (paise: number) =>
  (paise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" });

// Estimate total invested for SIPs based on months since start
function estimatedTotal(inv: Investment): number {
  if (inv.type !== "SIP" || !inv.startDate) return inv.amount;
  const months = Math.max(1, differenceInMonths(new Date(), parseISO(inv.startDate)) + 1);
  return inv.amount * months;
}

interface FormState {
  name: string;
  type: string;
  amount: string;
  startDate: string;
  notes: string;
}

const emptyForm: FormState = { name: "", type: "SIP", amount: "", startDate: "", notes: "" };

function InvestmentModal({
  initial,
  onClose,
}: {
  initial?: Investment;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          name: initial.name,
          type: initial.type,
          amount: (initial.amount / 100).toString(),
          startDate: initial.startDate ?? "",
          notes: initial.notes ?? "",
        }
      : emptyForm
  );
  const qc = useQueryClient();
  const { toast } = useToast();

  const save = useMutation({
    mutationFn: async () => {
      const url = initial ? `/api/investments/${initial.id}` : "/api/investments";
      const method = initial ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/investments"] });
      toast({ title: initial ? "Investment updated" : "Investment added" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-card rounded-2xl w-full max-w-md p-6 space-y-4 shadow-xl border border-border/50">
        <h2 className="text-lg font-bold">{initial ? "Edit Investment" : "Add Investment"}</h2>

        <div className="space-y-3">
          <Input placeholder="Name (e.g. Parag Parikh Flexi Cap)" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="rounded-xl" />

          <div className="flex flex-wrap gap-2">
            {INVESTMENT_TYPES.map(t => (
              <button key={t} type="button"
                onClick={() => setForm(f => ({ ...f, type: t }))}
                className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors
                  ${form.type === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                {t}
              </button>
            ))}
          </div>

          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
            <Input type="number" placeholder={form.type === "SIP" ? "Monthly amount" : "Amount"} value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="rounded-xl pl-7" />
          </div>

          <div className="space-y-1">
            <label className="text-[12px] text-muted-foreground pl-1">Start Date (optional)</label>
            <Input type="date" value={form.startDate}
              onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="rounded-xl" />
          </div>

          <Input placeholder="Notes (optional)" value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="rounded-xl" />
        </div>

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

export default function Investments() {
  const { data: investments = [], isLoading } = useQuery<Investment[]>({
    queryKey: ["/api/investments"],
    queryFn: async () => {
      const res = await fetch("/api/investments", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
  });
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modal, setModal] = useState<"add" | Investment | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/investments/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/investments"] });
      toast({ title: "Deleted" });
    },
  });

  const activeSIPs = investments.filter(i => i.type === "SIP" && i.isActive);
  const monthlySIP = activeSIPs.reduce((s, i) => s + i.amount, 0);
  const totalEstimated = investments.reduce((s, i) => s + estimatedTotal(i), 0);

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      {modal && (
        <InvestmentModal
          initial={modal === "add" ? undefined : modal}
          onClose={() => setModal(null)}
        />
      )}

      <header className="px-5 pt-12 pb-4 sticky top-0 bg-background/80 backdrop-blur-xl z-10 border-b border-transparent">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">Investments</h1>
          <button type="button"
            onClick={() => setModal("add")}
            className="bg-primary text-primary-foreground p-2 rounded-full shadow-md hover:bg-primary/90 transition-transform active:scale-95">
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="px-4 max-w-2xl mx-auto mt-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Monthly SIPs</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-lg text-muted-foreground">₹</span>
              <span className="text-2xl font-bold">{(monthlySIP / 100).toLocaleString("en-IN")}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">{activeSIPs.length} active SIP{activeSIPs.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Est. Total Invested</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-lg text-muted-foreground">₹</span>
              <span className="text-2xl font-bold">{(totalEstimated / 100).toLocaleString("en-IN")}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">{investments.length} investment{investments.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* Investment list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-card rounded-2xl animate-pulse border border-border/50" />
            ))}
          </div>
        ) : investments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4 opacity-50">
              <TrendingUp className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No investments yet</h3>
            <p className="text-muted-foreground text-[15px]">Tap + to add your first SIP or investment.</p>
          </div>
        ) : (
          <div className="ios-list">
            {investments.map(inv => (
              <div key={inv.id} className="ios-list-item group">
                <div className="flex flex-col justify-center flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[16px] font-medium truncate">{inv.name}</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${TYPE_COLORS[inv.type] ?? TYPE_COLORS.Other}`}>
                      {inv.type}
                    </span>
                    {!inv.isActive && (
                      <span className="text-[11px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted shrink-0">Inactive</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[13px] text-muted-foreground">
                      {fmt(inv.amount)}{inv.type === "SIP" ? "/mo" : ""}
                    </span>
                    {inv.startDate && (
                      <span className="text-[12px] text-muted-foreground">
                        Since {format(parseISO(inv.startDate), "MMM yyyy")}
                      </span>
                    )}
                    {inv.type === "SIP" && inv.startDate && (
                      <span className="text-[12px] text-muted-foreground">
                        · Est. {fmt(estimatedTotal(inv))} total
                      </span>
                    )}
                  </div>
                  {inv.notes && (
                    <p className="text-[12px] text-muted-foreground mt-0.5 truncate">{inv.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => setModal(inv)}
                    className="p-2 text-muted-foreground hover:bg-muted/20 rounded-full">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteMutation.mutate(inv.id)}
                    className="p-2 text-destructive hover:bg-destructive/10 rounded-full">
                    <Trash2 className="w-4 h-4" />
                  </button>
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
          <Plus className="w-6 h-6" /> Add Investment
        </button>
      </div>
    </div>
  );
}
