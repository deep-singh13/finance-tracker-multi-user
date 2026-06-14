// Types shared with the /sync-gmail Claude Code skill.
// The skill (running locally with Gmail MCP access) does the email fetching
// and parsing, then POSTs ParsedTransaction[] to POST /api/gmail/sync.

export interface ParsedTransaction {
  amount: number;      // in paise (100 paise = ₹1)
  description: string;
  category: string;
  date: string;        // YYYY-MM-DD
  externalId: string;  // Gmail message ID for deduplication
}
