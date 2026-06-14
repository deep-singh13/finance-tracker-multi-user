import { useState, useEffect, useCallback, useRef } from "react";
import { X, Mail, Loader2, CheckCircle, Trash2, Pencil, TrendingDown, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { CategoryIcon, CATEGORIES } from "./CategoryIcon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

const INCOME_SOURCES = [
  { value: "salary",     label: "Salary" },
  { value: "freelance",  label: "Freelance" },
  { value: "investment", label: "Investment" },
  { value: "other",      label: "Other" },
] as const;

interface StagedTx {
  tempId: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  externalId: string;
  type: "debit" | "credit";
  incomeSource: "salary" | "freelance" | "investment" | "other";
}

type ModalState = "waiting" | "reviewing" | "committing" | "done";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function GmailSyncModal({ open, onClose }: Props) {
  const [state, setState] = useState<ModalState>("waiting");
  const [transactions, setTransactions] = useState<StagedTx[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<StagedTx>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) {
      setState("waiting");
      setTransactions([]);
      setEditingId(null);
      setEditForm({});
      setErrorMsg(null);
    }
  }, [open]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/gmail/staged");
      if (!res.ok) return;
      const data: StagedTx[] = await res.json();
      if (data.length > 0) {
        setTransactions(data);
        setState("reviewing");
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!open || state !== "waiting") return;
    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, state, poll]);

  const handleDelete = async (tempId: string) => {
    await fetch(`/api/gmail/staged/${tempId}`, { method: "DELETE" });
    setTransactions(prev => prev.filter(t => t.tempId !== tempId));
  };

  const startEdit = (tx: StagedTx) => {
    setEditingId(tx.tempId);
    setEditForm({
      amount: tx.amount,
      description: tx.description,
      category: tx.category,
      date: tx.date,
      incomeSource: tx.incomeSource,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (tempId: string) => {
    const res = await fetch(`/api/gmail/staged/${tempId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (res.ok) {
      const updated: StagedTx = await res.json();
      setTransactions(prev => prev.map(t => t.tempId === tempId ? updated : t));
      setEditingId(null);
      setEditForm({});
    }
  };

  const handleCommit = async () => {
    setState("committing");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/gmail/commit", { method: "POST" });
      if (!res.ok) throw new Error("Commit failed");
      setState("done");
      // Invalidate both expenses and income
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/income"] });
      setTimeout(onClose, 1800);
    } catch {
      setErrorMsg("Failed to import. Please try again.");
      setState("reviewing");
    }
  };

  if (!open) return null;

  const fmt = (paise: number) =>
    `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const debits  = transactions.filter(t => t.type !== "credit");
  const credits = transactions.filter(t => t.type === "credit");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={state === "committing" ? undefined : onClose} />

      <div className="relative bg-background rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg flex flex-col overflow-hidden shadow-2xl"
           style={{ maxHeight: "92vh" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Mail className="w-4.5 h-4.5 text-primary" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold text-foreground leading-tight">
                {state === "waiting"    && "Waiting for Gmail Sync"}
                {state === "reviewing"  && `Review ${transactions.length} Transaction${transactions.length !== 1 ? "s" : ""}`}
                {state === "committing" && "Importing..."}
                {state === "done"       && "Import Complete"}
              </h2>
              {state === "reviewing" && (
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  {debits.length > 0 && `${debits.length} expense${debits.length !== 1 ? "s" : ""}`}
                  {debits.length > 0 && credits.length > 0 && " · "}
                  {credits.length > 0 && `${credits.length} credit${credits.length !== 1 ? "s" : ""}`}
                  {" — edit or remove before importing"}
                </p>
              )}
            </div>
          </div>
          {state !== "committing" && state !== "done" && (
            <button
              onClick={onClose}
              className="icon-btn w-8 h-8 rounded-full hover:bg-muted shrink-0 cursor-pointer"
              style={{ transition: "background-color 150ms var(--ease-out), transform 120ms var(--ease-out)" }}
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* Waiting */}
          {state === "waiting" && (
            <div className="flex flex-col items-center justify-center py-14 px-8 text-center gap-5">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Mail className="w-8 h-8 text-primary" />
                </div>
                <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 bg-background rounded-full flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[15px] font-semibold text-foreground">Waiting for sync...</p>
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  Run the{" "}
                  <code className="font-mono bg-muted px-1.5 py-0.5 rounded-md text-[12px] text-foreground">
                    /sync-gmail
                  </code>{" "}
                  skill in Claude Code to fetch your HDFC Bank transactions. They'll appear here automatically.
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/50 px-3 py-2 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Checking every 3 seconds
              </div>
            </div>
          )}

          {/* Reviewing */}
          {state === "reviewing" && (
            <div>
              {transactions.length === 0 ? (
                <div className="py-14 text-center">
                  <p className="text-[15px] text-muted-foreground">All transactions removed.</p>
                  <p className="text-[13px] text-muted-foreground mt-1">Click Cancel or close to exit.</p>
                </div>
              ) : (
                <div>
                  {/* Expenses section */}
                  {debits.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 px-5 py-2 bg-muted/30 border-b border-border/30">
                        <TrendingDown className="w-3.5 h-3.5 text-destructive" />
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                          Expenses ({debits.length})
                        </span>
                      </div>
                      <div className="divide-y divide-border/40">
                        {debits.map(tx => (
                          <TxRow
                            key={tx.tempId}
                            tx={tx}
                            editingId={editingId}
                            editForm={editForm}
                            setEditForm={setEditForm}
                            startEdit={startEdit}
                            cancelEdit={cancelEdit}
                            saveEdit={saveEdit}
                            handleDelete={handleDelete}
                            fmt={fmt}
                          />
                        ))}
                      </div>
                    </>
                  )}

                  {/* Credits section */}
                  {credits.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 px-5 py-2 bg-muted/30 border-b border-border/30">
                        <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                          Income / Credits ({credits.length})
                        </span>
                      </div>
                      <div className="divide-y divide-border/40">
                        {credits.map(tx => (
                          <TxRow
                            key={tx.tempId}
                            tx={tx}
                            editingId={editingId}
                            editForm={editForm}
                            setEditForm={setEditForm}
                            startEdit={startEdit}
                            cancelEdit={cancelEdit}
                            saveEdit={saveEdit}
                            handleDelete={handleDelete}
                            fmt={fmt}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Committing */}
          {state === "committing" && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="text-[15px] font-medium text-foreground">Saving transactions...</p>
            </div>
          )}

          {/* Done */}
          {state === "done" && (
            <div className="flex flex-col items-center justify-center py-16 gap-5">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="w-9 h-9 text-green-500" />
              </div>
              <div className="text-center">
                <p className="text-[16px] font-semibold text-foreground">Transactions imported!</p>
                <p className="text-[13px] text-muted-foreground mt-1">Your expense and income lists have been updated.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {(state === "waiting" || state === "reviewing") && (
          <div className="px-5 py-4 border-t border-border/50 shrink-0 bg-background">
            {errorMsg && (
              <p className="text-[13px] text-destructive text-center mb-3">{errorMsg}</p>
            )}
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl h-11">
                Cancel
              </Button>
              {state === "reviewing" && (
                <Button
                  onClick={handleCommit}
                  className="flex-1 rounded-xl h-11 font-semibold"
                  disabled={transactions.length === 0}
                >
                  Approve & Import ({transactions.length})
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Extracted row component ────────────────────────────────────────────────────
interface TxRowProps {
  tx: StagedTx;
  editingId: string | null;
  editForm: Partial<StagedTx>;
  setEditForm: React.Dispatch<React.SetStateAction<Partial<StagedTx>>>;
  startEdit: (tx: StagedTx) => void;
  cancelEdit: () => void;
  saveEdit: (id: string) => void;
  handleDelete: (id: string) => void;
  fmt: (n: number) => string;
}

function TxRow({ tx, editingId, editForm, setEditForm, startEdit, cancelEdit, saveEdit, handleDelete, fmt }: TxRowProps) {
  const isCredit = tx.type === "credit";

  if (editingId === tx.tempId) {
    return (
      <div className="px-5 py-3.5 space-y-3">
        {/* Amount */}
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-muted-foreground w-24 shrink-0">Amount (₹)</span>
          <input
            type="number" step="0.01"
            value={((editForm.amount ?? tx.amount) / 100).toFixed(2)}
            onChange={e => setEditForm(f => ({ ...f, amount: Math.round(parseFloat(e.target.value) * 100) }))}
            className="flex-1 bg-muted rounded-xl px-3 py-2 text-[14px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        {/* Description */}
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-muted-foreground w-24 shrink-0">Description</span>
          <input
            type="text"
            value={editForm.description ?? tx.description}
            onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
            className="flex-1 bg-muted rounded-xl px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        {/* Date */}
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-muted-foreground w-24 shrink-0">Date</span>
          <input
            type="date"
            value={editForm.date ?? tx.date}
            onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
            className="flex-1 bg-muted rounded-xl px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Category (debits) or Income Source (credits) */}
        {isCredit ? (
          <div className="flex items-start gap-3">
            <span className="text-[12px] text-muted-foreground w-24 shrink-0 pt-1.5">Income type</span>
            <div className="flex flex-wrap gap-1.5">
              {INCOME_SOURCES.map(s => (
                <button key={s.value} type="button"
                  onClick={() => setEditForm(f => ({ ...f, incomeSource: s.value }))}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-[12px] font-medium transition-colors",
                    (editForm.incomeSource ?? tx.incomeSource) === s.value
                      ? "bg-green-500 text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <span className="text-[12px] text-muted-foreground w-24 shrink-0 pt-1.5">Category</span>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(cat => (
                <button key={cat} type="button"
                  onClick={() => setEditForm(f => ({ ...f, category: cat }))}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-[12px] font-medium transition-colors",
                    (editForm.category ?? tx.category) === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button onClick={cancelEdit}
            className="flex-1 py-2 rounded-xl bg-muted text-[13px] font-medium text-muted-foreground active:scale-[0.97] cursor-pointer"
            style={{ transition: "background-color 150ms var(--ease-out), transform 120ms var(--ease-out)" }}>
            Cancel
          </button>
          <button onClick={() => saveEdit(tx.tempId)}
            className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold active:scale-[0.97] cursor-pointer"
            style={{ transition: "opacity 150ms var(--ease-out), transform 120ms var(--ease-out)" }}>
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      {isCredit ? (
        <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
          <TrendingUp className="w-4 h-4 text-green-500" />
        </div>
      ) : (
        <CategoryIcon category={tx.category} size="sm" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[14px] font-medium text-foreground truncate">{tx.description}</p>
          {isCredit && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 shrink-0">
              CREDIT
            </span>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          {format(new Date(tx.date + "T00:00:00"), "dd MMM yyyy")} ·{" "}
          {isCredit
            ? INCOME_SOURCES.find(s => s.value === tx.incomeSource)?.label ?? "Other"
            : tx.category}
        </p>
      </div>
      <span className={cn(
        "text-[14px] font-semibold shrink-0",
        isCredit ? "text-green-500" : "text-foreground"
      )}>
        {isCredit ? "+" : ""}{fmt(tx.amount)}
      </span>
      <div className="flex items-center gap-0.5 shrink-0 ml-1">
        <button onClick={() => startEdit(tx)}
          className="icon-btn w-8 h-8 hover:bg-muted cursor-pointer"
          style={{ transition: "background-color 150ms var(--ease-out), transform 120ms var(--ease-out)" }}>
          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <button onClick={() => handleDelete(tx.tempId)}
          className="icon-btn w-8 h-8 hover:bg-destructive/10 cursor-pointer"
          style={{ transition: "background-color 150ms var(--ease-out), transform 120ms var(--ease-out)" }}>
          <Trash2 className="w-3.5 h-3.5 text-destructive" />
        </button>
      </div>
    </div>
  );
}
