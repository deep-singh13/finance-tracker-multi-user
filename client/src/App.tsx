import { useEffect } from "react";
import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Investments from "@/pages/Investments";
import Subscriptions from "@/pages/Subscriptions";
import Income from "@/pages/Income";
import Login from "@/pages/Login";
import { History } from "@/components/History";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { LayoutDashboard, History as HistoryIcon, TrendingUp, RefreshCw, Wallet, LogOut } from "lucide-react";

// Runs on every app load — creates expenses for active subscriptions whose
// billing day has passed this month and haven't been billed yet.
function useSubscriptionBilling() {
  useEffect(() => {
    fetch("/api/subscriptions/process", { method: "POST" })
      .then(r => r.json())
      .then(({ billed }) => {
        if (billed > 0) {
          queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
        }
      })
      .catch(() => {});
  }, []);
}

function TabBar() {
  const [location] = useLocation();
  const logout = useLogout();

  const tabs = [
    { href: "/",              label: "Overview",      icon: LayoutDashboard },
    { href: "/income",        label: "Income",        icon: Wallet },
    { href: "/investments",   label: "Invest",        icon: TrendingUp },
    { href: "/subscriptions", label: "Subs",          icon: RefreshCw },
    { href: "/history",       label: "History",       icon: HistoryIcon },
  ];

  return (
    <nav className="tab-bar-glass fixed bottom-0 left-0 right-0 flex justify-around items-center px-2 py-2 pb-safe z-50">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = location === href;
        return (
          <Link key={href} href={href}>
            <a className="flex flex-col items-center gap-1 px-3 py-2 min-w-[52px] rounded-xl cursor-pointer group select-none"
               style={{ WebkitTapHighlightColor: "transparent" }}
               aria-label={label}>
              <span className={`w-9 h-9 flex items-center justify-center rounded-xl icon-btn ${
                active
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                  : "text-muted-foreground"
              }`}
              style={{ transition: "background-color 150ms var(--ease-out), color 150ms var(--ease-out), transform 120ms var(--ease-out)" }}>
                <Icon className="w-[18px] h-[18px]" />
              </span>
              <span className={`text-[9.5px] font-semibold tracking-wide ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
              style={{ transition: "color 150ms var(--ease-out)" }}>
                {label}
              </span>
            </a>
          </Link>
        );
      })}
      <button
        onClick={logout}
        className="flex flex-col items-center gap-1 px-3 py-2 min-w-[52px] rounded-xl cursor-pointer group select-none"
        style={{ WebkitTapHighlightColor: "transparent" }}
        aria-label="Lock / Logout"
      >
        <span className="icon-btn w-9 h-9 text-muted-foreground"
          style={{ transition: "background-color 150ms var(--ease-out), color 150ms var(--ease-out), transform 120ms var(--ease-out)" }}>
          <LogOut className="w-[18px] h-[18px]" />
        </span>
        <span className="text-[9.5px] font-semibold tracking-wide text-muted-foreground"
          style={{ transition: "color 150ms var(--ease-out)" }}>
          Lock
        </span>
      </button>
    </nav>
  );
}

function Router() {
  useSubscriptionBilling();

  return (
    <div className="pb-20">
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/income" component={Income} />
        <Route path="/investments" component={Investments} />
        <Route path="/subscriptions" component={Subscriptions} />
        <Route path="/history" component={History} />
        <Route component={NotFound} />
      </Switch>
      <TabBar />
    </div>
  );
}

// Shows a blank screen while checking auth, then Login or the app
function AuthGuard() {
  const { authenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <Login
        onSuccess={() => {
          queryClient.setQueryData(["/api/auth/me"], true);
        }}
      />
    );
  }

  return <Router />;
}

function App() {
  useEffect(() => {
    console.log(
      "%c₹ Finance Tracker",
      "font-size: 18px; font-weight: 700; color: #1D4ED8; font-family: 'IBM Plex Sans', system-ui, sans-serif;"
    );
    console.log(
      "%cSelf-hosted. Private. Every rupee accounted for.",
      "color: #6b7280; font-size: 12px; font-family: 'IBM Plex Sans', system-ui, sans-serif;"
    );
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="spending-app-theme">
        <TooltipProvider>
          <Toaster />
          <AuthGuard />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
