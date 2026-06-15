import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Upload, AlertTriangle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type ImportType = 'expense' | 'income' | 'both';

interface ParsedTransaction {
  date: string;
  amount: number;   // cents, always positive
  description: string;
  type: 'expense' | 'income';
  category: string;
  hash: string;
  isDuplicate: boolean;
}

interface ReviewRow extends ParsedTransaction {
  selected: boolean;
}

const CATEGORIES = [
  'Food', 'Transport', 'Entertainment', 'Shopping', 'Healthcare',
  'Utilities', 'Health', 'Housing', 'Education', 'Other',
];

export default function Import() {
  const [step, setStep]             = useState<1 | 2 | 3>(1);
  const [file, setFile]             = useState<File | null>(null);
  const [importType, setImportType] = useState<ImportType>('both');
  const [rows, setRows]             = useState<ReviewRow[]>([]);
  const [summary, setSummary]       = useState<{ expensesAdded: number; incomeAdded: number } | null>(null);
  const [dragOver, setDragOver]     = useState(false);
  const fileInputRef                = useRef<HTMLInputElement>(null);
  const [, navigate]                = useLocation();
  const { toast }                   = useToast();

  const parseMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected');
      const form = new FormData();
      form.append('file', file);
      form.append('importType', importType);
      const res = await fetch('/api/import/parse', { method: 'POST', body: form });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message ?? 'Parse failed'); }
      return res.json() as Promise<ParsedTransaction[]>;
    },
    onSuccess: data => {
      setRows(data.map(t => ({ ...t, selected: !t.isDuplicate })));
      setStep(2);
    },
    onError: (err: Error) => toast({ title: 'Parse failed', description: err.message, variant: 'destructive' }),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const selected = rows.filter(r => r.selected);
      if (!selected.length) throw new Error('No transactions selected');
      const res = await fetch('/api/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: selected }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message ?? 'Import failed'); }
      return res.json();
    },
    onSuccess: data => { setSummary(data); setStep(3); },
    onError: (err: Error) => toast({ title: 'Import failed', description: err.message, variant: 'destructive' }),
  });

  function updateRow(idx: number, patch: Partial<ReviewRow>) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  function handleFile(f: File) {
    if (!f.name.endsWith('.csv') && !f.name.endsWith('.pdf')) {
      toast({ title: 'Unsupported file', description: 'Please upload a CSV or PDF file', variant: 'destructive' });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum size is 10 MB', variant: 'destructive' });
      return;
    }
    setFile(f);
  }

  // ── Step 1: Upload ──────────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="p-4 max-w-lg mx-auto space-y-6">
        <h1 className="text-xl font-bold">Import Bank Statement</h1>

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'
          }`}
        >
          <Upload className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center">
            {file ? file.name : 'Drop a CSV or PDF here, or click to browse'}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium">Import transactions as</Label>
          <RadioGroup value={importType} onValueChange={v => setImportType(v as ImportType)} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="both" id="r-both" />
              <Label htmlFor="r-both">Let me choose per transaction (debits → expenses, credits → income)</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="expense" id="r-exp" />
              <Label htmlFor="r-exp">All as expenses</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="income" id="r-inc" />
              <Label htmlFor="r-inc">All as income</Label>
            </div>
          </RadioGroup>
        </div>

        <Button
          className="w-full"
          disabled={!file || parseMutation.isPending}
          onClick={() => parseMutation.mutate()}
        >
          {parseMutation.isPending ? 'Parsing…' : 'Parse Statement'}
        </Button>
      </div>
    );
  }

  // ── Step 2: Review & Edit ────────────────────────────────────────────────
  if (step === 2) {
    const selected    = rows.filter(r => r.selected);
    const dupSkipped  = rows.filter(r => r.isDuplicate && !r.selected).length;
    const expCount    = selected.filter(r => r.type === 'expense').length;
    const incCount    = selected.filter(r => r.type === 'income').length;

    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setStep(1)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-xl font-bold">Review Transactions</h1>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="outline">{expCount} expense{expCount !== 1 ? 's' : ''}</Badge>
          <Badge variant="outline">{incCount} income</Badge>
          {dupSkipped > 0 && (
            <Badge variant="secondary" className="text-amber-600">
              {dupSkipped} duplicate{dupSkipped !== 1 ? 's' : ''} skipped
            </Badge>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 text-left w-8">
                  <Checkbox
                    checked={rows.length > 0 && rows.every(r => r.selected)}
                    onCheckedChange={v => setRows(prev => prev.map(r => ({ ...r, selected: !!v })))}
                  />
                </th>
                <th className="p-2 text-left">Date</th>
                <th className="p-2 text-left">Description</th>
                <th className="p-2 text-right">Amount</th>
                <th className="p-2 text-left">Type</th>
                <th className="p-2 text-left">Category</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={`${row.hash}-${i}`}
                  className={`border-t ${row.isDuplicate ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}
                >
                  <td className="p-2">
                    <Checkbox checked={row.selected} onCheckedChange={v => updateRow(i, { selected: !!v })} />
                  </td>
                  <td className="p-2">
                    <Input
                      type="date"
                      value={row.date}
                      onChange={e => updateRow(i, { date: e.target.value })}
                      className="h-7 w-32 text-xs"
                    />
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-1">
                      {row.isDuplicate && (
                        <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" aria-label="Possible duplicate" />
                      )}
                      <Input
                        value={row.description}
                        onChange={e => updateRow(i, { description: e.target.value })}
                        className="h-7 text-xs min-w-[160px]"
                      />
                    </div>
                  </td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={(row.amount / 100).toFixed(2)}
                      onChange={e => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v)) updateRow(i, { amount: Math.round(v * 100) });
                      }}
                      className="h-7 w-24 text-xs text-right"
                    />
                  </td>
                  <td className="p-2">
                    <Select value={row.type} onValueChange={v => updateRow(i, { type: v as 'expense' | 'income' })}>
                      <SelectTrigger className="h-7 w-24 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expense">Expense</SelectItem>
                        <SelectItem value="income">Income</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2">
                    <Select value={row.category} onValueChange={v => updateRow(i, { category: v })}>
                      <SelectTrigger className="h-7 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Button
          className="w-full"
          disabled={selected.length === 0 || confirmMutation.isPending}
          onClick={() => confirmMutation.mutate()}
        >
          {confirmMutation.isPending
            ? 'Importing…'
            : `Import ${selected.length} transaction${selected.length !== 1 ? 's' : ''}`}
        </Button>
      </div>
    );
  }

  // ── Step 3: Summary ──────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-lg mx-auto space-y-6 text-center">
      <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
      <h1 className="text-xl font-bold">Import complete</h1>
      {summary && (
        <div className="flex justify-center gap-3 flex-wrap">
          {summary.expensesAdded > 0 && (
            <Badge variant="outline">{summary.expensesAdded} expense{summary.expensesAdded !== 1 ? 's' : ''} added</Badge>
          )}
          {summary.incomeAdded > 0 && (
            <Badge variant="outline">{summary.incomeAdded} income record{summary.incomeAdded !== 1 ? 's' : ''} added</Badge>
          )}
        </div>
      )}
      <div className="flex gap-3 justify-center flex-wrap">
        {summary?.expensesAdded ? (
          <Button variant="outline" onClick={() => navigate('/')}>View Expenses</Button>
        ) : null}
        {summary?.incomeAdded ? (
          <Button variant="outline" onClick={() => navigate('/income')}>View Income</Button>
        ) : null}
        <Button onClick={() => { setStep(1); setFile(null); setRows([]); setSummary(null); }}>
          Import Another
        </Button>
      </div>
    </div>
  );
}
