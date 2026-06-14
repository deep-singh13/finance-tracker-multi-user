// Finance Tracker — Scriptable Widget
// 1. Install Scriptable (free) from the App Store
// 2. Fill in WORKER_URL and WIDGET_API_KEY below
// 3. Add a medium Scriptable widget to your home screen and pick this script

const WORKER_URL = "https://finance-widget.<YOUR_SUBDOMAIN>.workers.dev";
const WIDGET_API_KEY = "<YOUR_WIDGET_API_KEY>";

// ── Colors ────────────────────────────────────────────────────────────────────
const C = {
  bg:         new Color("#1C1C1E"),
  label:      new Color("#8E8E93"),
  primary:    Color.white(),
  green:      new Color("#30D158"),
  red:        new Color("#FF453A"),
  blue:       new Color("#0A84FF"),
  orange:     new Color("#FF9F0A"),
};

// ── Formatting ────────────────────────────────────────────────────────────────
function fmt(paise) {
  const r = paise / 100;
  if (r >= 100000) return `₹${(r / 100000).toFixed(1)}L`;
  if (r >= 1000)   return `₹${(r / 1000).toFixed(1)}K`;
  return `₹${Math.round(r).toLocaleString("en-IN")}`;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Cache ─────────────────────────────────────────────────────────────────────
const fm        = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), "finance_widget_cache.json");

function readCache() {
  try {
    if (fm.fileExists(cachePath)) return JSON.parse(fm.readString(cachePath));
  } catch {}
  return null;
}

function writeCache(data) {
  try { fm.writeString(cachePath, JSON.stringify({ ...data, cachedAt: new Date().toISOString() })); }
  catch {}
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function fetchData() {
  const req = new Request(`${WORKER_URL}?key=${WIDGET_API_KEY}`);
  req.timeoutInterval = 10;
  try {
    const data = await req.loadJSON();
    if (data && data.monthSpendPaise !== undefined) {
      writeCache(data);
      return { data, stale: false };
    }
  } catch {}
  const cached = readCache();
  return cached ? { data: cached, stale: true } : { data: null, stale: true };
}

// ── Widget ────────────────────────────────────────────────────────────────────
function buildWidget(data, stale) {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(14, 16, 12, 16);

  // ── Header ──────────────────────────────────────────────────────────────────
  const header = w.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();

  const title = header.addText("Finance");
  title.font = Font.boldSystemFont(13);
  title.textColor = C.primary;

  header.addSpacer();

  const [yr, mo] = data.month.split("-");
  const monthTag = header.addText(`${MONTHS[parseInt(mo) - 1]} ${yr}`);
  monthTag.font = Font.systemFont(11);
  monthTag.textColor = C.label;

  if (stale) {
    header.addSpacer(5);
    const dot = header.addText("●");
    dot.font = Font.systemFont(7);
    dot.textColor = C.orange;
  }

  w.addSpacer(10);

  // ── Row 1: Month spend + Daily avg ──────────────────────────────────────────
  const row1 = w.addStack();
  row1.layoutHorizontally();

  const spendCol = row1.addStack();
  spendCol.layoutVertically();
  const spendLbl = spendCol.addText("MONTH SPEND");
  spendLbl.font = Font.systemFont(8);
  spendLbl.textColor = C.label;
  spendCol.addSpacer(2);
  const spendVal = spendCol.addText(fmt(data.monthSpendPaise));
  spendVal.font = Font.boldSystemFont(18);
  spendVal.textColor = C.primary;

  row1.addSpacer();

  const avgCol = row1.addStack();
  avgCol.layoutVertically();
  const avgLbl = avgCol.addText("DAILY AVG");
  avgLbl.font = Font.systemFont(8);
  avgLbl.textColor = C.label;
  avgCol.addSpacer(2);
  const avgVal = avgCol.addText(`${fmt(data.dailyAvgPaise)}/d`);
  avgVal.font = Font.boldSystemFont(18);
  avgVal.textColor = C.primary;

  w.addSpacer(10);

  // ── Row 2: Top category ──────────────────────────────────────────────────────
  const catRow = w.addStack();
  catRow.layoutHorizontally();
  catRow.centerAlignContent();
  const catLbl = catRow.addText("TOP  ");
  catLbl.font = Font.systemFont(11);
  catLbl.textColor = C.label;
  if (data.topCategory) {
    const catName = catRow.addText(data.topCategory.name);
    catName.font = Font.boldSystemFont(11);
    catName.textColor = C.blue;
    catRow.addSpacer();
    const catAmt = catRow.addText(fmt(data.topCategory.amountPaise));
    catAmt.font = Font.boldSystemFont(11);
    catAmt.textColor = C.primary;
  } else {
    const none = catRow.addText("No data");
    none.font = Font.systemFont(11);
    none.textColor = C.label;
  }

  w.addSpacer(7);

  // ── Row 3: Net cash flow ─────────────────────────────────────────────────────
  const cfRow = w.addStack();
  cfRow.layoutHorizontally();
  cfRow.centerAlignContent();
  const cfLbl = cfRow.addText("NET FLOW  ");
  cfLbl.font = Font.systemFont(11);
  cfLbl.textColor = C.label;
  cfRow.addSpacer();
  const positive = data.netCashFlowPaise >= 0;
  const cfVal = cfRow.addText(
    `${positive ? "+" : "−"}${fmt(Math.abs(data.netCashFlowPaise))}`
  );
  cfVal.font = Font.boldSystemFont(11);
  cfVal.textColor = positive ? C.green : C.red;

  w.addSpacer(7);

  // ── Row 4: Upcoming subscriptions ────────────────────────────────────────────
  const subRow = w.addStack();
  subRow.layoutHorizontally();
  subRow.centerAlignContent();
  if (data.upcomingSubscriptions && data.upcomingSubscriptions.length > 0) {
    const count = data.upcomingSubscriptions.length;
    const subLbl = subRow.addText(`UPCOMING (${count})  `);
    subLbl.font = Font.systemFont(11);
    subLbl.textColor = C.label;
    const first = data.upcomingSubscriptions[0];
    const subName = subRow.addText(first.name);
    subName.font = Font.systemFont(11);
    subName.textColor = C.primary;
    if (count > 1) {
      const more = subRow.addText(` +${count - 1}`);
      more.font = Font.systemFont(11);
      more.textColor = C.label;
    }
    subRow.addSpacer();
    const subTotal = subRow.addText(fmt(data.upcomingTotalPaise));
    subTotal.font = Font.boldSystemFont(11);
    subTotal.textColor = C.orange;
  } else {
    const none = subRow.addText("No upcoming subscriptions");
    none.font = Font.systemFont(11);
    none.textColor = C.label;
  }

  w.addSpacer(6);

  // ── Footer ───────────────────────────────────────────────────────────────────
  const timeStr = new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
  const footer = w.addText(`Updated ${timeStr}${stale ? " (cached)" : ""}`);
  footer.font = Font.systemFont(8);
  footer.textColor = C.label;

  // Suggest a refresh interval of 30 minutes
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

  return w;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const { data, stale } = await fetchData();

if (!data) {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(14, 16, 14, 16);
  const err = w.addText("Finance Tracker\nUnable to load data.");
  err.font = Font.systemFont(12);
  err.textColor = C.label;
  Script.setWidget(w);
} else {
  Script.setWidget(buildWidget(data, stale));
}

Script.complete();
