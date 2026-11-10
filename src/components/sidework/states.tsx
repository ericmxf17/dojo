import { AlertCircle, Inbox, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function LoadingBlock({ rows = 3, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full bg-muted" />
      ))}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  title = "Couldn't load this",
}: {
  error: unknown;
  onRetry?: (() => void) | undefined;
  title?: string;
}) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div
      role="alert"
      className="panel flex flex-col items-start gap-3 border-primary/40 bg-warning-surface p-5"
    >
      <div className="flex items-center gap-2 font-medium text-primary">
        <AlertCircle className="size-4" aria-hidden /> {title}
      </div>
      <p className="text-sm text-foreground/80">{msg}</p>
      <p className="text-xs text-muted-foreground">
        Side Work did not switch to sample data. Fix the connection or change modes in the sidebar.
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw /> Retry
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-6 py-10 text-center">
      <Inbox className="size-5 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
      {action}
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="font-display text-4xl leading-tight md:text-5xl">{title}</h1>
      {children && <p className="mt-2 max-w-2xl text-muted-foreground">{children}</p>}
    </header>
  );
}
