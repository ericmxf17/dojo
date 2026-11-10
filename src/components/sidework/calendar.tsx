import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  List,
  Pause,
  Play,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useWorkspace, useWorkspaceQuery } from "./workspace-hooks";
import { ErrorState, LoadingBlock, EmptyState, PageHeader } from "./states";
import { dates, transitions } from "@/lib/sidework/workspace-api";
import type {
  EventInput,
  CalendarEvent,
  Line,
  OrderInput,
  ScheduleInput,
  CalendarItem,
} from "@/lib/sidework/workspace-types";
import { formatCents, formatDate } from "@/lib/sidework/format";
const emptyEvent: EventInput = {
  title: "",
  date: "2026-11-09",
  kind: "event",
  notes: "",
  repeat: "none",
  repeat_until: null,
  active: true,
};
const emptyLine: Line = { ingredient: "", quantity: "1", unit: "lb", unit_cost_cents: null };
export function Calendar() {
  const { workspace, date, keyBase } = useWorkspace();
  const qc = useQueryClient();
  const [tab, setTab] = useState("calendar");
  const [view, setView] = useState("month");
  const [month, setMonth] = useState("2026-11");
  const first = month + "-01";
  const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const end = month + "-" + last;
  const q = useWorkspaceQuery(["calendar", month], () => workspace.calendar(first, end));
  const events = useWorkspaceQuery(["events"], () => workspace.events());
  const orders = useWorkspaceQuery(["orders"], () => workspace.orders());
  const schedules = useWorkspaceQuery(["schedules"], () => workspace.schedules());
  const [event, setEvent] = useState(emptyEvent);
  const [eventId, setEventId] = useState<string | undefined>();
  const [modal, setModal] = useState<string | null>(null);
  const [supplier, setSupplier] = useState("");
  const [due, setDue] = useState(date);
  const [until, setUntil] = useState("2026-12-09");
  const [interval, setInterval] = useState(7);
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [notice, setNotice] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: [...keyBase, "workspace"] });
  const mutation = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      refresh();
      setNotice("Changes saved.");
    },
    onError: () => setNotice(""),
  });
  const saveEvent = useMutation({
    mutationFn: () => workspace.saveEvent(event, eventId),
    onSuccess: () => {
      setModal(null);
      refresh();
      setNotice("Calendar event saved.");
    },
  });
  const saveOrder = useMutation({
    mutationFn: async () =>
      modal === "schedule"
        ? await workspace.createSchedule({
            supplier,
            first_due_on: due,
            every_days: interval,
            until,
            lines,
            notes,
            active: true,
          })
        : await workspace.createOrder({ supplier, due_on: due, lines, notes }),
    onSuccess: () => {
      setModal(null);
      refresh();
      setNotice("Draft saved. No supplier was contacted.");
    },
  });
  const shift = (n: number) => {
    const d = new Date(first + "T12:00:00");
    d.setMonth(d.getMonth() + n);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const editEvent = (e: CalendarEvent) => {
    setEvent({
      title: e.title,
      date: e.date,
      kind: e.kind,
      notes: e.notes,
      repeat: e.repeat,
      repeat_until: e.repeat_until,
      active: e.active,
    });
    setEventId(e.id);
    setModal("event");
  };
  const newOrder = (schedule: boolean) => {
    setSupplier("");
    setDue(date);
    setUntil("2026-12-09");
    setLines([{ ...emptyLine }]);
    setNotes("");
    setModal(schedule ? "schedule" : "order");
  };
  let planned: string[] = [];
  let planError = "";
  try {
    if (modal === "schedule") planned = dates(due, until, interval);
  } catch (e) {
    planError = e instanceof Error ? e.message : String(e);
  }
  const cells = [
    ...Array(new Date(first + "T12:00:00").getDay()).fill(null),
    ...Array.from({ length: last }, (_, i) => i + 1),
  ];
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Stay ahead of the week." />
        <Button
          onClick={() => {
            if (tab === "calendar") {
              setEvent({ ...emptyEvent, date });
              setEventId(undefined);
              setModal("event");
            } else newOrder(tab === "recurring");
          }}
        >
          <Plus />
          {tab === "calendar"
            ? "New event"
            : tab === "orders"
              ? "New order"
              : "New recurring order"}
        </Button>
      </div>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {[
            ["calendar", "Calendar"],
            ["orders", "Orders"],
            ["recurring", "Recurring Orders"],
          ].map(([k, label]) => (
            <Button
              key={k}
              variant={tab === k ? "default" : "outline"}
              onClick={() => setTab(k ?? "calendar")}
            >
              {label}
            </Button>
          ))}
        </div>
        {tab === "calendar" && (
          <div className="flex gap-1">
            <Button
              variant={view === "month" ? "secondary" : "ghost"}
              size="icon"
              aria-label="Month view"
              onClick={() => setView("month")}
            >
              <CalendarDays />
            </Button>
            <Button
              variant={view === "agenda" ? "secondary" : "ghost"}
              size="icon"
              aria-label="Agenda view"
              onClick={() => setView("agenda")}
            >
              <List />
            </Button>
          </div>
        )}
      </div>
      {notice && (
        <p role="status" className="mb-5 text-primary">
          {notice}
        </p>
      )}
      {mutation.error && <ErrorState error={mutation.error} />}{" "}
      {tab === "calendar" && (
        <>
          <div className="mb-5 flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous month"
              onClick={() => shift(-1)}
            >
              <ChevronLeft />
            </Button>
            <h2 className="min-w-44 text-center text-xl font-medium">
              {new Date(first + "T12:00:00").toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </h2>
            <Button variant="outline" size="icon" aria-label="Next month" onClick={() => shift(1)}>
              <ChevronRight />
            </Button>
          </div>
          {q.isLoading && <LoadingBlock />}
          {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}{" "}
          {q.data && view === "month" && (
            <div className="overflow-hidden rounded-md border border-border bg-card">
              <div className="grid grid-cols-7 border-b border-border bg-muted">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="p-3 text-center text-xs text-muted-foreground">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((day, i) => {
                  const value = day ? `${month}-${String(day).padStart(2, "0")}` : "";
                  const items = q.data.filter((e) => e.date === value);
                  return (
                    <div
                      key={i}
                      className={`min-h-[100px] min-w-0 border-b border-r border-border p-1.5 sm:min-h-[140px] sm:p-3 ${value === date ? "bg-secondary/50" : ""}`}
                    >
                      <span className="text-sm">{day}</span>
                      {items.slice(0, 3).map((e) => (
                        <Button
                          key={e.id}
                          variant="ghost"
                          className="mt-1 h-auto w-full justify-start whitespace-normal rounded-sm bg-secondary/60 px-1 py-1.5 text-left text-[10px] leading-tight sm:px-2 sm:text-xs"
                          onClick={() => setSelected(e)}
                        >
                          {e.title}
                        </Button>
                      ))}
                      {items.length > 3 && (
                        <Button
                          variant="link"
                          className="h-auto p-0 text-xs"
                          onClick={() => setView("agenda")}
                        >
                          +{items.length - 3} more
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {q.data && view === "agenda" && (
            <div>
              {!q.data.length && <EmptyState title="No items scheduled this month" />}
              {q.data.map((e) => (
                <Button
                  variant="ghost"
                  key={e.id}
                  className="flex h-auto w-full justify-between whitespace-normal border-b border-border py-5 text-left"
                  onClick={() => setSelected(e)}
                >
                  <div>
                    <p className="font-medium">{e.title}</p>
                    <p className="mt-1 text-xs capitalize text-muted-foreground">
                      {e.kind.replace(/_/g, " ")}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">{formatDate(e.date)}</span>
                </Button>
              ))}
            </div>
          )}
          <section className="mt-9">
            <h2 className="mb-4 text-2xl font-medium">Owner events & holidays</h2>
            {events.error && <ErrorState error={events.error} />}{" "}
            {events.data?.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-4"
              >
                <div>
                  <h3 className="font-medium">{e.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDate(e.date)} · {e.repeat === "none" ? "One-time" : e.repeat} ·{" "}
                    {e.active ? "Active" : "Inactive"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => editEvent(e)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      mutation.mutate(() =>
                        workspace.saveEvent(
                          {
                            title: e.title,
                            date: e.date,
                            kind: e.kind,
                            notes: e.notes,
                            repeat: e.repeat,
                            repeat_until: e.repeat_until,
                            active: !e.active,
                          },
                          e.id,
                        ),
                      )
                    }
                  >
                    {e.active ? <Pause /> : <Play />}
                    {e.active ? "Make inactive" : "Activate"}
                  </Button>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
      {tab === "orders" && (
        <>
          {orders.isLoading && <LoadingBlock />}
          {orders.error && <ErrorState error={orders.error} />}{" "}
          {orders.data?.length === 0 && <EmptyState title="No orders yet" />}
          {orders.data?.map((o) => (
            <div key={o.id} className="mb-6 border-b border-border pb-6">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-medium">{o.supplier}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Due {formatDate(o.due_on)} · <span className="capitalize">{o.status}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {transitions[o.status].map((s) => (
                    <Button
                      key={s}
                      variant="outline"
                      disabled={mutation.isPending}
                      className="capitalize"
                      onClick={() => mutation.mutate(() => workspace.orderStatus(o.id, s))}
                    >
                      Mark {s}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto rounded-md border border-border bg-card">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Ingredient</th>
                      <th>Quantity</th>
                      <th>Unit cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.lines.map((l, i) => (
                      <tr key={i}>
                        <td>{l.ingredient}</td>
                        <td>
                          {l.quantity} {l.unit}
                        </td>
                        <td>{formatCents(l.unit_cost_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {o.notes && <p className="mt-3 text-sm text-muted-foreground">{o.notes}</p>}
            </div>
          ))}
          <p className="text-sm text-muted-foreground">
            Statuses are owner-reported. Marking placed does not contact the supplier or submit a
            purchase. Receiving does not update inventory.
          </p>
        </>
      )}
      {tab === "recurring" && (
        <>
          {schedules.isLoading && <LoadingBlock />}
          {schedules.error && <ErrorState error={schedules.error} />}{" "}
          {schedules.data?.length === 0 && (
            <EmptyState title="No recurring orders yet">
              Create a schedule to preview its planned dates before generating drafts.
            </EmptyState>
          )}
          {schedules.data?.map((s) => (
            <div key={s.id} className="border-b border-border py-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-medium">{s.supplier}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Every {s.every_days} days · {s.active ? "Active" : "Paused"} · Through{" "}
                    {formatDate(s.until)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => mutation.mutate(() => workspace.scheduleActive(s.id, !s.active))}
                  >
                    {s.active ? <Pause /> : <Play />}
                    {s.active ? "Pause" : "Resume"}
                  </Button>
                  <Button
                    disabled={!s.active || mutation.isPending}
                    onClick={() =>
                      mutation.mutate(async () => {
                        const r = await workspace.generate(s.id, s.until);
                        setTimeout(
                          () =>
                            setNotice(
                              `${r.created_order_ids.length} new order drafts generated. ${r.existing_order_ids.length} existing drafts skipped. No supplier contacted.`,
                            ),
                          0,
                        );
                        return r;
                      })
                    }
                  >
                    <RefreshCw />
                    Generate order drafts
                  </Button>
                </div>
              </div>
              <div className="mt-5 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Planned due dates</p>
                <p className="mt-2 leading-relaxed">
                  {dates(s.first_due_on, s.until, s.every_days)
                    .map((d) => formatDate(d))
                    .join(" · ")}
                </p>
                <p className="mt-3">
                  {s.lines.map((l) => `${l.quantity} ${l.unit} ${l.ingredient}`).join(", ")}
                </p>
              </div>
            </div>
          ))}
        </>
      )}
      <Dialog open={modal === "event"} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="bg-card">
          <DialogTitle>{eventId ? "Edit event" : "New event"}</DialogTitle>
          <DialogDescription>
            Owner-entered business dates. No external holiday feed is connected.
          </DialogDescription>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveEvent.mutate();
            }}
          >
            <label className="field">
              Title
              <input
                required
                maxLength={250}
                value={event.title}
                onChange={(e) => setEvent({ ...event, title: e.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="field">
                Date
                <input
                  type="date"
                  required
                  value={event.date}
                  onChange={(e) => setEvent({ ...event, date: e.target.value })}
                />
              </label>
              <label className="field">
                Kind
                <select
                  value={event.kind}
                  onChange={(e) =>
                    setEvent({ ...event, kind: e.target.value as EventInput["kind"] })
                  }
                >
                  {["event", "holiday", "deadline"].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="field">
                Repeat
                <select
                  value={event.repeat}
                  onChange={(e) =>
                    setEvent({ ...event, repeat: e.target.value as EventInput["repeat"] })
                  }
                >
                  {["none", "weekly", "monthly", "yearly"].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              {event.repeat !== "none" && (
                <label className="field">
                  Repeat until
                  <input
                    type="date"
                    min={event.date}
                    value={event.repeat_until ?? ""}
                    onChange={(e) => setEvent({ ...event, repeat_until: e.target.value || null })}
                  />
                </label>
              )}
            </div>
            <label className="field">
              Notes
              <textarea
                value={event.notes}
                maxLength={5000}
                onChange={(e) => setEvent({ ...event, notes: e.target.value })}
              />
            </label>
            {saveEvent.error && <ErrorState error={saveEvent.error} />}
            <Button type="submit" disabled={saveEvent.isPending}>
              Save event
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "order" || modal === "schedule"}
        onOpenChange={(o) => !o && setModal(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto bg-card">
          <DialogTitle>
            {modal === "schedule" ? "New recurring order" : "New order draft"}
          </DialogTitle>
          <DialogDescription>
            No supplier is contacted. Generate drafts explicitly after reviewing planned dates.
          </DialogDescription>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveOrder.mutate();
            }}
          >
            <label className="field">
              Supplier
              <input
                required
                maxLength={250}
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="field">
                {modal === "schedule" ? "First due date" : "Due date"}
                <input required type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </label>
              {modal === "schedule" && (
                <>
                  <label className="field">
                    Repeat every (days)
                    <input
                      required
                      type="number"
                      min={1}
                      max={366}
                      step={1}
                      value={interval}
                      onChange={(e) => setInterval(Number(e.target.value))}
                    />
                  </label>
                  <label className="field">
                    End date
                    <input
                      required
                      type="date"
                      min={due}
                      value={until}
                      onChange={(e) => setUntil(e.target.value)}
                    />
                  </label>
                </>
              )}
            </div>
            <div className="space-y-3">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                  <label className="field">
                    Ingredient
                    <input
                      required
                      value={l.ingredient}
                      onChange={(e) =>
                        setLines(
                          lines.map((r, n) => (n === i ? { ...r, ingredient: e.target.value } : r)),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    Quantity
                    <input
                      required
                      min="0.001"
                      max="1000000"
                      step="any"
                      type="number"
                      value={l.quantity}
                      onChange={(e) =>
                        setLines(
                          lines.map((r, n) => (n === i ? { ...r, quantity: e.target.value } : r)),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    Unit
                    <input
                      required
                      value={l.unit}
                      onChange={(e) =>
                        setLines(
                          lines.map((r, n) => (n === i ? { ...r, unit: e.target.value } : r)),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    Unit cost ($)
                    <input
                      min="0"
                      step="0.01"
                      type="number"
                      value={l.unit_cost_cents === null ? "" : l.unit_cost_cents / 100}
                      onChange={(e) =>
                        setLines(
                          lines.map((r, n) =>
                            n === i
                              ? {
                                  ...r,
                                  unit_cost_cents:
                                    e.target.value === ""
                                      ? null
                                      : Math.round(Number(e.target.value) * 100),
                                }
                              : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="self-end"
                    disabled={lines.length < 2}
                    aria-label={`Remove ingredient line ${i + 1}`}
                    onClick={() => setLines(lines.filter((_, n) => n !== i))}
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLines([...lines, { ...emptyLine }])}
            >
              <Plus />
              Add ingredient
            </Button>
            <label className="field">
              Notes
              <textarea value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} />
            </label>
            {modal === "schedule" && (
              <div className="text-sm text-muted-foreground">
                <p className="mb-2 font-medium text-foreground">Planned dates</p>
                {planError || planned.map((d) => formatDate(d)).join(" · ")}
              </div>
            )}
            {saveOrder.error && <ErrorState error={saveOrder.error} />}
            <Button disabled={saveOrder.isPending || !!planError} type="submit">
              {modal === "schedule" ? "Save recurring schedule" : "Save order draft"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="bg-card">
          <DialogTitle>{selected?.title}</DialogTitle>
          <DialogDescription>
            {selected && formatDate(selected.date)} · {selected?.kind.replace(/_/g, " ")}
          </DialogDescription>
          {selected?.notes && <p>{selected.notes}</p>}
          {selected?.status && (
            <p className="capitalize">Status: {selected.status.replace(/_/g, " ")}</p>
          )}
          <Button
            onClick={() => {
              const e = events.data?.find((e) => e.id === selected?.resource_id);
              if (e) editEvent(e);
              else
                setTab(
                  selected?.kind === "scheduled_order"
                    ? "recurring"
                    : selected?.kind === "order"
                      ? "orders"
                      : "calendar",
                );
              setSelected(null);
            }}
          >
            Open details
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
