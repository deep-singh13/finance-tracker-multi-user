import { neon } from "@neondatabase/serverless";

interface Env {
  DATABASE_URL: string;
  WIDGET_API_KEY: string;
}

const CORS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

// Returns current date components in IST (UTC+5:30)
function istNow() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const year = ist.getUTCFullYear();
  const month = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const day = ist.getUTCDate();
  return { year, month, day, currentMonth: `${year}-${month}` };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Auth: accept key via query param or header
    const url = new URL(request.url);
    const key = url.searchParams.get("key") ?? request.headers.get("X-Widget-Key");
    if (!env.WIDGET_API_KEY || key !== env.WIDGET_API_KEY) {
      return json({ error: "Unauthorized" }, 401);
    }

    try {
      const sql = neon(env.DATABASE_URL);
      const { day, currentMonth } = istNow();

      const [expenseRows, categoryRows, subscriptionRows, incomeRows] = await Promise.all([
        // Month spend + daily avg base
        sql`
          SELECT COALESCE(SUM(amount), 0) AS total
          FROM expenses
          WHERE TO_CHAR(date, 'YYYY-MM') = ${currentMonth}
        `,
        // Top spending category
        sql`
          SELECT category, SUM(amount) AS total
          FROM expenses
          WHERE TO_CHAR(date, 'YYYY-MM') = ${currentMonth}
          GROUP BY category
          ORDER BY total DESC
          LIMIT 1
        `,
        // Upcoming subscriptions: active, not yet billed, billing day still ahead
        sql`
          SELECT name, amount, billing_day
          FROM subscriptions
          WHERE is_active = true
            AND billing_day > ${day}
            AND (last_billed_month IS NULL OR last_billed_month != ${currentMonth})
          ORDER BY billing_day ASC
        `,
        // Income this month
        sql`
          SELECT COALESCE(SUM(amount), 0) AS total
          FROM income
          WHERE TO_CHAR(date, 'YYYY-MM') = ${currentMonth}
        `,
      ]);

      const monthSpendPaise = Number(expenseRows[0].total);
      const incomePaise = Number(incomeRows[0].total);
      const dailyAvgPaise = day > 0 ? Math.round(monthSpendPaise / day) : 0;
      const netCashFlowPaise = incomePaise - monthSpendPaise;

      const topCategory =
        categoryRows.length > 0
          ? { name: categoryRows[0].category as string, amountPaise: Number(categoryRows[0].total) }
          : null;

      const upcomingSubscriptions = subscriptionRows.map((s) => ({
        name: s.name as string,
        amountPaise: Number(s.amount),
        billingDay: Number(s.billing_day),
      }));

      const upcomingTotalPaise = upcomingSubscriptions.reduce((sum, s) => sum + s.amountPaise, 0);

      return json({
        month: currentMonth,
        monthSpendPaise,
        dailyAvgPaise,
        topCategory,
        upcomingSubscriptions,
        upcomingTotalPaise,
        netCashFlowPaise,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      return json({ error: "Internal error" }, 500);
    }
  },
};
