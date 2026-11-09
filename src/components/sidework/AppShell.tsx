import { Link, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { BookOpen, CalendarDays, Database, Menu, MessageSquareText, Plug, Upload, Warehouse, LayoutDashboard, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { resetSampleData } from "@/lib/sidework/api";
import { useHealth, useSideWork } from "@/lib/sidework/context";
import { SourcesDrawer } from "./SourcesDrawer";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/imports", label: "Imports", icon: Upload },
  { to: "/pantry", label: "Digital Pantry", icon: Warehouse },
  { to: "/records", label: "Records", icon: Database },
  { to: "/ask", label: "Ask Side Work", icon: MessageSquareText },
  { to: "/connections", label: "Connections", icon: Plug },
] as const;

function ModeIndicator({ onOpen }: { onOpen: () => void }) {
  const { mode, baseUrl } = useSideWork();
  const health = useHealth();
  const live = mode === "live";
  const dot = !live ? "bg-warning" : health.isError ? "bg-primary" : health.isSuccess ? "bg-success" : "bg-muted-foreground";
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-md border border-border p-3 text-left hover:bg-muted">
      <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <span className={`size-2 rounded-full ${dot}`} aria-hidden />
        {live ? "Connected API" : "Sample data"}
        <Settings2 className="ml-auto size-3.5" aria-hidden />
      </span>
      <span className="mt-1 block truncate text-xs text-muted-foreground">
        {live ? (health.isError ? "Server unreachable" : baseUrl) : "Stored in this browser only"}
      </span>
    </button>
  );
}

function ModeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { mode, setMode, baseUrl, setBaseUrl } = useSideWork();
  const qc = useQueryClient();
  const [draftMode, setDraftMode] = useState(mode);
  const [draftUrl, setDraftUrl] = useState(baseUrl);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setDraftMode(mode);
          setDraftUrl(baseUrl);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Data mode</DialogTitle>
          <DialogDescription>Choose where Side Work reads records from. Side Work never switches modes on its own.</DialogDescription>
        </DialogHeader>
        <RadioGroup value={draftMode} onValueChange={(v) => setDraftMode(v as typeof mode)} className="gap-3">
          <Label className="flex items-start gap-3 rounded-md border border-border p-3 font-normal">
            <RadioGroupItem value="sample" className="mt-0.5" />
            <span>
              <span className="block font-medium">Sample data</span>
              <span className="text-sm text-muted-foreground">Juniper Kitchen demo records. Works without a server; imports stay in this browser.</span>
            </span>
          </Label>
          <Label className="flex items-start gap-3 rounded-md border border-border p-3 font-normal">
            <RadioGroupItem value="live" className="mt-0.5" />
            <span>
              <span className="block font-medium">Connected API</span>
              <span className="text-sm text-muted-foreground">Uses your Side Work backend. A published site needs a reachable HTTPS address with CORS allowed; it can't reach your computer's localhost.</span>
            </span>
          </Label>
        </RadioGroup>
        {draftMode === "live" && (
          <div className="space-y-1.5">
            <Label htmlFor="api-url">API base URL</Label>
            <Input id="api-url" value={draftUrl} onChange={(e) => setDraftUrl(e.target.value)} placeholder="https://api.example.com" />
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              resetSampleData();
              qc.invalidateQueries({ queryKey: ["sw", "sample"] });
              toast.success("Sample data reset to the original Juniper Kitchen records.");
            }}
          >
            Reset sample data
          </Button>
          <Button
            onClick={() => {
              setBaseUrl(draftUrl.trim() || baseUrl);
              setMode(draftMode);
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SidebarBody({ onNavigate, onOpenMode }: { onNavigate?: () => void; onOpenMode: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-2">
        <div className="font-display text-3xl leading-none text-primary">Side Work</div>
        <div className="mt-3 rounded-md bg-muted px-3 py-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Sample restaurant</div>
          <div className="text-sm font-medium">Juniper Kitchen</div>
        </div>
      </div>
      <nav aria-label="Main" className="flex-1">
        <ul className="space-y-0.5">
          {NAV.map((n) => {
            const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
            return (
              <li key={n.to}>
                <Link
                  to={n.to}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-cobalt text-cobalt-foreground" : "text-foreground/80 hover:bg-cobalt-soft hover:text-cobalt"}`}
                >
                  <n.icon className="size-4" aria-hidden />
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <ModeIndicator onOpen={onOpenMode} />
    </div>
  );
}

export function titleFor(path: string) {
  return NAV.find((n) => (n.to === "/" ? path === "/" : path.startsWith(n.to)))?.label ?? "Side Work";
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { date, setDate, mode } = useSideWork();
  const [drawer, setDrawer] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen w-[230px] shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        <SidebarBody onOpenMode={() => setModeOpen(true)} />
      </aside>
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="w-[260px] bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody onNavigate={() => setDrawer(false)} onOpenMode={() => { setDrawer(false); setModeOpen(true); }} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:px-8">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setDrawer(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <span className="truncate text-sm font-medium">{titleFor(path)}</span>
          {mode === "sample" && (
            <span className="hidden rounded-sm border border-warning/40 bg-warning-soft px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-warning sm:inline">
              Sample data
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-md border border-input bg-card px-2 py-1 text-sm">
              <CalendarDays className="size-4 text-cobalt" aria-hidden />
              <span className="sr-only">Business date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && setDate(e.target.value)}
                onInput={(e) => /^\d{4}-\d{2}-\d{2}$/.test(e.currentTarget.value) && setDate(e.currentTarget.value)}
                onBlur={(e) => /^\d{4}-\d{2}-\d{2}$/.test(e.currentTarget.value) && setDate(e.currentTarget.value)}
                className="num bg-transparent text-sm outline-none"
                aria-label="Business date"
              />
            </label>
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link to="/imports">
                <Upload /> Import records
              </Link>
            </Button>
            <Button asChild size="icon" className="sm:hidden" aria-label="Import records">
              <Link to="/imports">
                <Upload />
              </Link>
            </Button>
          </div>
        </header>
        {mode === "sample" && (
          <div className="border-b border-border bg-warning-soft px-4 py-1.5 text-xs text-warning sm:hidden">Sample data</div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8 md:py-10">{children}</main>
        <footer className="px-4 pb-6 text-xs text-muted-foreground md:px-8">
          <BookOpen className="mr-1 inline size-3" aria-hidden /> Side Work summarizes imported records. It doesn't replace your POS, reservations, or payroll tools.
        </footer>
      </div>
      <ModeDialog open={modeOpen} onOpenChange={setModeOpen} />
      <SourcesDrawer />
    </div>
  );
}
