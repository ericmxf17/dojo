import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Wallet,
  Files,
  CalendarDays,
  Upload,
  Warehouse,
  Database,
  MessageSquare,
  Menu,
  Settings2,
  ChevronDown,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useSideWork, useHealth } from "@/lib/sidework/context";
import { PROVIDERS } from "@/lib/sidework/workspace-types";
import { HomeLogo } from "./brand";
import { SourcesDrawer } from "./SourcesDrawer";
const operations = [
  { to: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/payroll", label: "Payroll", Icon: Wallet },
  { to: "/documents", label: "Legal Documents", Icon: Files },
  { to: "/calendar", label: "Calendar & Orders", Icon: CalendarDays },
] as const;
const data = [
  { to: "/imports", label: "Imports", Icon: Upload },
  { to: "/pantry", label: "Digital Pantry", Icon: Warehouse },
  { to: "/records", label: "Records", Icon: Database },
  { to: "/ask", label: "Ask Side Work", Icon: MessageSquare },
] as const;
export function AppShell({ children }: { children: ReactNode }) {
  const { date, setDate, mode, setMode, baseUrl, setBaseUrl } = useSideWork();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const health = useHealth();
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [url, setUrl] = useState(baseUrl);
  const sidebar = (
    <div className="flex h-full flex-col px-5 py-7">
      <div className="px-2">
        <HomeLogo />
      </div>
      <div className="mt-8 border-b border-border pb-5">
        <p className="px-3 text-base font-medium">Juniper Kitchen</p>
        <p className="mt-1 px-3 text-xs text-muted-foreground">
          {mode === "sample" ? "Synthetic sample restaurant" : "Connected workspace"}
        </p>
      </div>
      <nav className="mt-5 flex-1 overflow-y-auto" aria-label="Owner navigation">
        {[
          { items: operations, label: "OPERATIONS" },
          { items: data, label: "DATA" },
        ].map(({ items, label }, i) => (
          <div key={String(label)}>
            {i === 1 && (
              <div className="mb-6">
                <p className="mb-2 px-3 text-xs font-medium text-muted-foreground">TOOLS</p>
                {PROVIDERS.map((p) => (
                  <Link
                    key={p.id}
                    to="/providers/$provider"
                    params={{ provider: p.id }}
                    onClick={() => setMenu(false)}
                    className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm ${path === "/providers/" + p.id ? "bg-secondary font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    <span className="flex size-5 items-center justify-center text-sm font-semibold">
                      {p.name.slice(0, 1)}
                    </span>
                    {p.name}
                  </Link>
                ))}
              </div>
            )}
            <p className="mb-2 px-3 text-xs font-medium text-muted-foreground">{String(label)}</p>
            <div className="mb-6">
              {items.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setMenu(false)}
                  className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm ${path === n.to ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                >
                  <n.Icon className="size-[18px]" />
                  {n.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <Button
        variant="outline"
        onClick={() => {
          setUrl(baseUrl);
          setSettings(true);
        }}
        className="mt-3 h-auto justify-between bg-card px-3 py-3"
      >
        <span className="text-left">
          <span className="block text-sm">
            {mode === "sample" ? "Sample data" : "Connected API"}
          </span>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            {mode === "sample"
              ? "Stored in this browser"
              : health.isSuccess
                ? "Server available"
                : "Server unavailable"}
          </span>
        </span>
        <Settings2 className="size-4" />
      </Button>
    </div>
  );
  const title =
    [...operations, ...data].find((n) => n.to === path)?.label ??
    PROVIDERS.find((p) => path.endsWith("/" + p.id))?.name ??
    "Workspace";
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[238px] border-r border-border bg-card md:block">
        {sidebar}
      </aside>
      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left" className="w-[265px] bg-card p-0">
          <SheetTitle className="sr-only">Owner navigation</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>
      <div className="app-main">
        <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-5 py-4 md:px-9">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMenu(true)}
              aria-label="Open navigation"
              className="md:hidden"
            >
              <Menu />
            </Button>
            <span className="text-sm text-muted-foreground">
              Workspace <span className="mx-2">/</span>
              <span className="font-medium text-foreground">{title}</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
              <CalendarDays className="size-4 text-primary" />
              <input
                aria-label="Service date"
                type="date"
                value={date}
                onChange={(e) => {
                  if (e.target.value) setDate(e.target.value);
                }}
                className="min-w-0 bg-transparent"
              />
            </label>
            <Button asChild variant="outline" className="hidden lg:inline-flex">
              <Link to="/imports">
                <Upload />
                Import records
              </Link>
            </Button>
          </div>
        </header>
        <div className="border-b border-border bg-secondary/50 px-5 py-2.5 text-sm text-muted-foreground md:px-9">
          {mode === "sample"
            ? "Sample data · Synthetic records and changes are stored in this browser only."
            : "Connected API · Records are read from your configured backend. No sample fallback."}
        </div>
        <main className="mx-auto max-w-[1450px] px-5 py-8 md:px-9 md:py-10">{children}</main>
      </div>
      <SourcesDrawer />
      <Dialog open={settings} onOpenChange={setSettings}>
        <DialogContent className="bg-card">
          <DialogTitle>Data mode</DialogTitle>
          <DialogDescription>
            Sample records stay local. Connected API requires a reachable Side Work backend; vendor
            connections remain not connected.
          </DialogDescription>
          <div className="flex gap-2">
            <Button
              variant={mode === "sample" ? "default" : "outline"}
              onClick={() => setMode("sample")}
            >
              Sample data
            </Button>
            <Button
              variant={mode === "live" ? "default" : "outline"}
              onClick={() => setMode("live")}
            >
              Connected API
            </Button>
          </div>
          <label className="field">
            API address
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-hosted-api.example.com"
            />
          </label>
          <p className="text-sm text-muted-foreground">
            Your GitHub backend has been restored. Its README describes a local Python server, not a
            hosted API. Keep secret API keys server-side.
          </p>
          <Button
            onClick={() => {
              setBaseUrl(url.trim() || "/sidework-api");
              setSettings(false);
            }}
          >
            Save settings <ArrowUpRight />
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
