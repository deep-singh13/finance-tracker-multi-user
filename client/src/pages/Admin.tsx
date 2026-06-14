import { useState } from "react";
import { useAdminUsers, useAdminMutations } from "@/hooks/use-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export default function Admin() {
  const { data: users, isLoading } = useAdminUsers();
  const { createUser, deleteUser, resetPassword, setRole } = useAdminMutations();
  const { toast } = useToast();
  const [nu, setNu] = useState({ username: "", password: "" });

  const run = (p: Promise<unknown>, ok: string) =>
    p.then(() => toast({ title: ok })).catch((e: Error) => toast({ title: e.message, variant: "destructive" }));

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <h1 className="text-xl font-bold">Admin · Users</h1>

      <form
        className="flex gap-2 items-end"
        onSubmit={(e) => { e.preventDefault(); run(createUser.mutateAsync(nu), "User created").then(() => setNu({ username: "", password: "" })); }}
      >
        <div className="flex-1"><Input placeholder="username" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} /></div>
        <div className="flex-1"><Input placeholder="password (min 8)" type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} /></div>
        <Button type="submit" disabled={createUser.isPending}>Create user</Button>
      </form>

      {isLoading ? <p>Loading…</p> : (
        <Table>
          <TableHeader>
            <TableRow><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Txns</TableHead><TableHead>Last login</TableHead><TableHead></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {users?.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.username}</TableCell>
                <TableCell><Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge></TableCell>
                <TableCell>{u.expenseCount + u.incomeCount}</TableCell>
                <TableCell>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "—"}</TableCell>
                <TableCell className="flex gap-1 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => run(setRole.mutateAsync({ id: u.id, role: u.role === "admin" ? "user" : "admin" }), "Role updated")}>
                    {u.role === "admin" ? "Demote" : "Promote"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { const p = prompt("New password (min 8 chars)"); if (p) run(resetPassword.mutateAsync({ id: u.id, password: p }), "Password reset"); }}>Reset pw</Button>
                  <Button size="sm" variant="destructive" onClick={() => { if (confirm(`Delete ${u.username} and all their data?`)) run(deleteUser.mutateAsync(u.id), "User deleted"); }}>Delete</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
