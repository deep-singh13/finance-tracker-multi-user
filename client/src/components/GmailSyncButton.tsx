import { useEffect, useState } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Mail, RefreshCw } from "lucide-react";
import { GmailSyncModal } from "./GmailSyncModal";

export function GmailSyncButton() {
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchStatus = () => {
    fetch("/api/gmail/status")
      .then((r) => r.json())
      .then((d) => setLastSyncedAt(d.lastSyncedAt))
      .catch(() => {});
  };

  useEffect(() => { fetchStatus(); }, []);

  const handleClose = () => {
    setModalOpen(false);
    fetchStatus();
  };

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-card hover:bg-muted/50 active:scale-[0.98] transition-all text-left"
      >
        <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-foreground">Sync Gmail</p>
          {lastSyncedAt ? (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Last synced {formatDistanceToNow(parseISO(lastSyncedAt), { addSuffix: true })}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground mt-0.5">Import HDFC Bank transactions</p>
          )}
        </div>
        <RefreshCw className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      </button>
      <GmailSyncModal open={modalOpen} onClose={handleClose} />
    </>
  );
}
