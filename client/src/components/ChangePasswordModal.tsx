import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordModal({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => { setCurrent(""); setNext(""); setConfirm(""); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast({ title: "New passwords do not match", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (res.ok) {
        toast({ title: "Password changed" });
        reset();
        onOpenChange(false);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: data.message || "Could not change password", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error. Check your connection.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Enter your current password and choose a new one (at least 8 characters).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cur-pw">Current password</Label>
            <Input id="cur-pw" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-pw">New password</Label>
            <Input id="new-pw" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conf-pw">Confirm new password</Label>
            <Input id="conf-pw" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
          </div>
          <DialogFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Saving…" : "Change password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
