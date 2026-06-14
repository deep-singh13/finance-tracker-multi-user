import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";

interface LoginProps {
  onSuccess: () => void;
  bootstrap?: boolean; // first-ever user: register form instead of login
}

export default function Login({ onSuccess, bootstrap = false }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const endpoint = bootstrap ? "/api/auth/register" : "/api/auth/login";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
        credentials: "include",
      });
      if (res.ok) { onSuccess(); return; }
      const data = await res.json().catch(() => ({}));
      setError(res.status === 429 ? "Too many attempts. Try again in 15 minutes." : data.message || "Incorrect username or password");
    } catch {
      setError("Network error. Check your connection.");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="absolute top-5 right-5"><ThemeToggle /></div>
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="text-center space-y-1">
          <div className="w-16 h-16 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">💰</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Finance Tracker</h1>
          <p className="text-[14px] text-muted-foreground">
            {bootstrap ? "Create the first (admin) account" : "Sign in to your account"}
          </p>
        </div>
        <form onSubmit={submit} className="w-full space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete={bootstrap ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          {error && <p className="text-[13px] text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Please wait…" : bootstrap ? "Create admin account" : "Sign in"}
          </Button>
        </form>
        <p className="text-[12px] text-muted-foreground/50 text-center">Secured with bcrypt · Rate-limited</p>
      </div>
    </div>
  );
}
