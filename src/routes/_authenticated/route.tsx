import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Radar,
  Settings,
  Building2,
  Activity,
  ArrowLeftRight,
  History,
  ScrollText,
  Bot,
  GitBranch,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/scanner", label: "Scanner", icon: Radar },
  { to: "/strategy", label: "Strategy", icon: Settings },
  { to: "/exchanges", label: "Exchanges", icon: Building2 },
  { to: "/sessions", label: "Sessions", icon: Activity },
  { to: "/trades", label: "Trades", icon: History },
  { to: "/transfers", label: "Transfers", icon: ArrowLeftRight },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/bot", label: "Executor", icon: Bot },
  { to: "/sync", label: "Git sync", icon: GitBranch },
] as const;

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex">
        <aside className="hidden md:flex w-60 flex-col border-r border-border bg-card/30 min-h-screen px-3 py-4 gap-1">
          <div className="px-3 py-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-md bg-primary/20 grid place-items-center">
                <Radar className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold tracking-tight">ArbDesk</div>
                <div className="text-[10px] text-muted-foreground">Cross-exchange scanner</div>
              </div>
            </div>
          </div>
          <nav className="flex flex-col gap-0.5">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeProps={{ className: "bg-accent text-accent-foreground" }}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto px-3 py-2">
            <div className="text-xs text-muted-foreground truncate mb-2" title={user.email ?? ""}>
              {user.email}
            </div>
            <Button variant="outline" size="sm" className="w-full justify-start" onClick={signOut}>
              <LogOut className="h-3.5 w-3.5 mr-2" /> Sign out
            </Button>
          </div>
        </aside>
        <main className="flex-1 min-w-0 px-4 md:px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}