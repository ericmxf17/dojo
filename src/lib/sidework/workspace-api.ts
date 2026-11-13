import { eventDates } from "./recurrence";
import { ApiError, type SideWorkApi } from "./api";
import {
  normalizeImport,
  normalizeRecord,
  type WireImport,
  type WireRecord,
} from "./live-contract";
import type { StoredRecord } from "./types";
import {
  type WorkspaceApi,
  type CabinetDocument,
  type DocumentInput,
  type CalendarEvent,
  type Order,
  type Schedule,
  type PayrollReport,
  type CalendarItem,
  type PayrollEmployee,
  PROVIDERS,
  type Status,
} from "./workspace-types";
export const DOCUMENT_LIMIT = 10_000_000;
export const transitions: Record<Status, Status[]> = {
  draft: ["placed", "cancelled"],
  placed: ["confirmed", "received", "cancelled"],
  confirmed: ["received", "cancelled"],
  received: [],
  cancelled: [],
};
export function validDocumentSize(size: number) {
  if (size < 1 || size > DOCUMENT_LIMIT)
    throw new ApiError("File must contain between 1 byte and 10 MB.", 413, "validation");
}
export function dates(first: string, until: string, every: number) {
  if (!Number.isInteger(every) || every < 1 || every > 366)
    throw new ApiError("Repeat interval must be between 1 and 366 whole days.", 422);
  if (until < first || new Date(until).getTime() - new Date(first).getTime() > 366 * 86400000)
    throw new ApiError("The schedule must end within one year of its first date.", 422);
  const days: string[] = [];
  const d = new Date(first + "T12:00:00Z");
  for (let i = 0; i < 367 && d.toISOString().slice(0, 10) <= until; i++) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + every);
  }
  return days;
}
export function combineLabor(records: StoredRecord[], start: string, end: string): PayrollReport {
  if (end < start) throw new ApiError("End date must be on or after the start date.", 422);
  const people = new Map<string, PayrollEmployee>();
  for (const r of records.filter(
    (r) => String(r.data.business_date) >= start && String(r.data.business_date) <= end,
  )) {
    const name = String(r.data.employee);
    const e = people.get(name) ?? {
      employee: name,
      hours: "0",
      base_wages_cents: 0,
      tips_cents: 0,
      bonus_cents: 0,
      reimbursement_cents: 0,
      estimated_total_cents: 0,
      sources: [],
    };
    e.hours = String(Number(e.hours) + Number(r.data.hours));
    e.base_wages_cents += Math.round(Number(r.data.hours) * Number(r.data.hourly_rate_cents));
    e.estimated_total_cents = e.base_wages_cents;
    e.sources.push(r.source);
    people.set(name, e);
  }
  const employees = [...people.values()].sort((a, b) => a.employee.localeCompare(b.employee));
  const total = employees.reduce((n, e) => n + e.base_wages_cents, 0);
  return {
    start,
    end,
    employees,
    total_hours: String(employees.reduce((n, e) => n + Number(e.hours), 0)),
    totals: { base_wages_cents: total, estimated_total_cents: total },
    missing_data: employees.length === 0,
  };
}
type State = {
  documents: CabinetDocument[];
  events: CalendarEvent[];
  orders: Order[];
  schedules: Schedule[];
  runs: PayrollReport[];
  attribution: Record<string, string>;
  keys: Record<string, string>;
};
const seed = (): State => ({
  documents: [
    {
      id: "sample-permit",
      title: "Food service permit",
      category: "permit",
      deadline: "2026-11-18",
      notes: "Synthetic sample. Confirm renewal with the issuer.",
      status: "active",
      versions: [],
    },
    {
      id: "sample-insurance",
      title: "General liability insurance",
      category: "insurance",
      deadline: "2026-11-27",
      notes: "Synthetic sample.",
      status: "active",
      versions: [],
    },
  ],
  events: [
    {
      id: "sample-meeting",
      title: "Team service review",
      date: "2026-11-12",
      kind: "event",
      repeat: "weekly",
      repeat_until: "2026-12-31",
      active: true,
      notes: "Sample team meeting",
    },
  ],
  orders: [
    {
      id: "sample-delivery",
      supplier: "Sample produce supplier",
      due_on: "2026-11-11",
      lines: [{ ingredient: "Tomatoes", quantity: "8", unit: "lb", unit_cost_cents: 300 }],
      notes: "Synthetic sample delivery",
      status: "confirmed",
    },
  ],
  schedules: [],
  runs: [],
  attribution: {},
  keys: {},
});
const load = (): State => {
  try {
    const raw = localStorage.getItem("sidework.workspace.v1");
    return raw ? JSON.parse(raw) : seed();
  } catch {
    return seed();
  }
};
const save = (s: State) => localStorage.setItem("sidework.workspace.v1", JSON.stringify(s));
const uid = () => crypto.randomUUID();
const resource = <T extends { id: string }>(rows: T[], id: string) => {
  const r = rows.find((r) => r.id === id);
  if (!r) throw new ApiError("Record not found.", 404);
  return r;
};
const serialize = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
async function fileDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("sidework.files", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("versions");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(new ApiError("Local document storage is unavailable."));
  });
}
export function createWorkspaceApi(api: SideWorkApi, baseUrl: string): WorkspaceApi {
  const root = baseUrl.replace(/\/+$/, "");
  async function live<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
    let response: Response;
    try {
      response = await fetch(
        root + path,
        body instanceof FormData
          ? { method, body }
          : body !== undefined
            ? {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              }
            : undefined,
      );
    } catch {
      throw new ApiError(
        "Could not reach the backend. No sample data has been substituted.",
        null,
        "network",
      );
    }
    if (!response.ok) {
      let message = `Backend responded with ${response.status}.`;
      try {
        const d = await response.json();
        message = typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail);
      } catch {}
      throw new ApiError(message, response.status);
    }
    return response.json();
  }
  async function blob(path: string) {
    const r = await fetch(root + path);
    if (!r.ok) throw new ApiError(`Download failed (${r.status}).`, r.status);
    return r.blob();
  }
  async function labor() {
    const all: StoredRecord[] = [];
    let offset = 0;
    while (true) {
      const r = await api.listRecords("labor", null, 1000, offset);
      all.push(...r.records);
      if (all.length >= r.total || !r.records.length) return all;
      offset += r.records.length;
    }
  }
  return {
    async serviceSummary(on) {
      if (api.mode === "live") return live("/api/service-summary?on=" + on);
      const [b, l] = await Promise.all([api.briefing(on), api.listRecords("labor", on, 1000, 0)]);
      return {
        date: on,
        net_sales_cents: b.metrics.net_sales.amount_cents,
        total_hours: l.total
          ? String(l.records.reduce((n, r) => n + Number(r.data.hours), 0))
          : null,
        estimated_base_wages_cents: b.metrics.estimated_wages.amount_cents,
        sales_sources: b.metrics.net_sales.sources,
        labor_sources: b.metrics.estimated_wages.sources,
      };
    },
    async payrollPreview(start, end) {
      if (api.mode === "live") return live(`/api/payroll/preview?start=${start}&end=${end}`);
      return combineLabor(await labor(), start, end);
    },
    async createPayroll(start, end, adjustments, key) {
      if (api.mode === "live")
        return live("/api/payroll/runs", { start, end, adjustments, idempotency_key: key });
      const s = load();
      const prior = s.keys[key];
      if (prior)
        return resource(
          s.runs.filter((r): r is PayrollReport & { id: string } => !!r.id),
          prior,
        );
      const r = combineLabor(await labor(), start, end);
      if (r.missing_data)
        throw new ApiError("No labor records in this period; a draft cannot be created.", 422);
      for (const e of r.employees) {
        const a = adjustments.find((a) => a.employee === e.employee);
        if (a) {
          for (const v of [a.tips_cents, a.bonus_cents, a.reimbursement_cents])
            if (!Number.isInteger(v) || v < 0 || v > 100_000_000)
              throw new ApiError(
                "Adjustments must be nonnegative USD amounts within the supported limit.",
                422,
              );
          Object.assign(e, a);
        }
        e.estimated_total_cents =
          e.base_wages_cents + e.tips_cents + e.bonus_cents + e.reimbursement_cents;
      }
      r.totals.estimated_total_cents = r.employees.reduce((n, e) => n + e.estimated_total_cents, 0);
      r.id = uid();
      r.created_at = new Date().toISOString();
      s.runs.unshift(r);
      s.keys[key] = r.id;
      save(s);
      return r;
    },
    async payrollRuns() {
      return api.mode === "live" ? live("/api/payroll/runs") : load().runs;
    },
    async exportPayroll(run, format) {
      if (api.mode === "live") return blob(`/api/payroll/runs/${run.id}/export?format=${format}`);
      const columns = [
        "employee",
        "hours",
        "base_wages_cents",
        "tips_cents",
        "bonus_cents",
        "reimbursement_cents",
        "estimated_total_cents",
      ] as const;
      const rows = run.employees.map((e) => columns.map((k) => String(e[k])));
      if (format === "csv")
        return new Blob(
          [
            columns.join(",") +
              "\r\n" +
              rows
                .map((r) =>
                  r
                    .map((v) => '"' + v.replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"')
                    .join(","),
                )
                .join("\r\n"),
          ],
          { type: "text/csv" },
        );
      return new Blob(
        [
          `<!doctype html><html lang="en"><meta charset="utf-8"><title>Payroll preparation draft</title><body><h1>Payroll preparation draft</h1><p>${run.start} to ${run.end}. Money columns are integer USD cents.</p><table border="1" cellpadding="10"><tr>${columns.map((c) => `<th>${c}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((v) => `<td>${serialize(v)}</td>`).join("")}</tr>`).join("")}</table><p>No payroll submission, taxes, overtime premiums or final net pay are calculated.</p></body></html>`,
        ],
        { type: "text/html" },
      );
    },
    async documents() {
      return api.mode === "live" ? live("/api/documents?status=all") : load().documents;
    },
    async document(id) {
      return api.mode === "live" ? live("/api/documents/" + id) : resource(load().documents, id);
    },
    async saveDocument(input, id) {
      if (api.mode === "live")
        return live("/api/documents" + (id ? "/" + id : ""), input, id ? "PUT" : "POST");
      const s = load();
      const d = {
        ...input,
        id: id ?? uid(),
        versions: id ? (resource(s.documents, id).versions ?? []) : [],
      };
      s.documents = id ? s.documents.map((r) => (r.id === id ? d : r)) : [d, ...s.documents];
      save(s);
      return d;
    },
    async uploadVersion(id, file) {
      validDocumentSize(file.size);
      if (api.mode === "live") {
        const fd = new FormData();
        fd.append("file", file);
        return live(`/api/documents/${id}/versions`, fd);
      }
      const s = load();
      const d = resource(s.documents, id);
      const v = {
        id: uid(),
        filename: file.name,
        size_bytes: file.size,
        version: (d.versions?.length ?? 0) + 1,
        created_at: new Date().toISOString(),
      };
      const db = await fileDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("versions", "readwrite");
        tx.objectStore("versions").put(file, v.id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new ApiError("Could not save this file."));
      });
      db.close();
      d.versions = [v, ...(d.versions ?? [])];
      save(s);
      return v;
    },
    async downloadVersion(id, v) {
      if (api.mode === "live") return blob(`/api/documents/${id}/versions/${v.id}/download`);
      const db = await fileDb();
      return new Promise<Blob>((resolve, reject) => {
        const r = db.transaction("versions").objectStore("versions").get(v.id);
        r.onsuccess = () => {
          db.close();
          r.result instanceof Blob
            ? resolve(r.result)
            : reject(new ApiError("Version is not available in this browser."));
        };
        r.onerror = () => reject(new ApiError("Could not read the file."));
      });
    },
    async events() {
      return api.mode === "live" ? live("/api/calendar/events") : load().events;
    },
    async saveEvent(input, id) {
      if (api.mode === "live")
        return live("/api/calendar/events" + (id ? "/" + id : ""), input, id ? "PUT" : "POST");
      if (input.repeat_until && input.repeat_until < input.date)
        throw new ApiError("Repeat end must not precede event date.", 422);
      const s = load();
      const e = { ...input, id: id ?? uid() };
      s.events = id ? s.events.map((r) => (r.id === id ? e : r)) : [e, ...s.events];
      save(s);
      return e;
    },
    async calendar(start, end) {
      if (api.mode === "live") {
        const r = await live<{ items: CalendarItem[] }>(`/api/calendar?start=${start}&end=${end}`);
        return r.items;
      }
      const s = load();
      const items: CalendarItem[] = [];
      for (const e of s.events)
        for (const day of eventDates(e, start, end))
          items.push({
            id: `event:${e.id}:${day}`,
            date: day,
            title: e.title,
            kind: e.kind,
            resource_id: e.id,
            notes: e.notes,
          });
      for (const d of s.documents)
        if (d.status === "active" && d.deadline)
          items.push({
            id: "document:" + d.id,
            date: d.deadline,
            title: d.title,
            kind: "document_deadline",
            resource_id: d.id,
          });
      for (const o of s.orders)
        items.push({
          id: "order:" + o.id,
          date: o.due_on,
          title: "Delivery: " + o.supplier,
          kind: "order",
          resource_id: o.id,
          status: o.status,
        });
      for (const r of s.schedules.filter((r) => r.active))
        for (const day of dates(r.first_due_on, r.until, r.every_days))
          if (!s.orders.some((o) => o.schedule_id === r.id && o.due_on === day))
            items.push({
              id: `schedule:${r.id}:${day}`,
              date: day,
              title: "Planned order: " + r.supplier,
              kind: "scheduled_order",
              resource_id: r.id,
            });
      return items
        .filter((i) => i.date >= start && i.date <= end)
        .sort((a, b) => a.date.localeCompare(b.date));
    },
    async orders() {
      return api.mode === "live" ? live("/api/orders") : load().orders;
    },
    async createOrder(input) {
      if (api.mode === "live") return live("/api/orders", input);
      const s = load();
      const o = { ...input, id: uid(), status: "draft" as const };
      s.orders.unshift(o);
      save(s);
      return o;
    },
    async orderStatus(id, status) {
      if (api.mode === "live") return live(`/api/orders/${id}/status`, { status });
      const s = load();
      const o = resource(s.orders, id);
      if (o.status !== status && !transitions[o.status].includes(status))
        throw new ApiError("Status transition is not permitted.", 409);
      o.status = status;
      save(s);
      return o;
    },
    async schedules() {
      return api.mode === "live" ? live("/api/order-schedules") : load().schedules;
    },
    async createSchedule(input) {
      dates(input.first_due_on, input.until, input.every_days);
      if (api.mode === "live") return live("/api/order-schedules", input);
      const s = load();
      const r = { ...input, id: uid() };
      s.schedules.unshift(r);
      save(s);
      return r;
    },
    async scheduleActive(id, active) {
      if (api.mode === "live") return live(`/api/order-schedules/${id}/active`, { active });
      const s = load();
      const r = resource(s.schedules, id);
      r.active = active;
      save(s);
      return r;
    },
    async generate(id, through) {
      if (api.mode === "live") return live(`/api/order-schedules/${id}/generate`, { through });
      const s = load();
      const r = resource(s.schedules, id);
      if (!r.active) throw new ApiError("Schedule is paused.", 409);
      const created: string[] = [];
      const existing: string[] = [];
      for (const day of dates(r.first_due_on, r.until, r.every_days).filter((d) => d <= through)) {
        const o = s.orders.find((o) => o.schedule_id === id && o.due_on === day);
        if (o) {
          existing.push(o.id);
          continue;
        }
        const next = {
          id: uid(),
          supplier: r.supplier,
          due_on: day,
          lines: structuredClone(r.lines),
          notes: r.notes,
          status: "draft" as const,
          schedule_id: id,
        };
        s.orders.push(next);
        created.push(next.id);
      }
      save(s);
      return { created_order_ids: created, existing_order_ids: existing };
    },
    async provider(id, on) {
      if (id === "resy") return [];
      if (api.mode === "live") {
        const r = await live<{ records: WireRecord[] }>(`/api/providers/${id}?on=${on}`);
        return r.records.map(normalizeRecord);
      }
      const s = load();
      const records = await Promise.all(
        (PROVIDERS.find((p) => p.id === id)?.kinds ?? []).map((k) =>
          api.listRecords(k, on, 1000, 0),
        ),
      );
      return records
        .flatMap((r) => r.records)
        .filter((r) => s.attribution[r.source.import_id] === id);
    },
    async providerImport(id, kind, file) {
      if (!PROVIDERS.find((p) => p.id === id)?.kinds.includes(kind))
        throw new ApiError("Record category is not supported for this provider.", 422);
      if (api.mode === "live") {
        const fd = new FormData();
        fd.append("file", file);
        return normalizeImport(
          await live<WireImport>(`/api/providers/${id}/imports/preview?kind=${kind}`, fd),
        );
      }
      const p = await api.previewImport(kind, file);
      const s = load();
      if (s.attribution[p.id] && s.attribution[p.id] !== id)
        throw new ApiError("File is attributed to another provider.", 409);
      s.attribution[p.id] = id;
      save(s);
      return p;
    },
    async testProvider(id) {
      if (api.mode !== "live")
        throw new ApiError("Switch to live backend mode before testing credentials.", 409);
      if (!["toast", "7shifts", "marketman"].includes(id))
        throw new ApiError("This provider does not support self-service connection testing.", 409);
      return live<{ connected: boolean; note: string }>(
        `/api/providers/${id}/test-connection`,
        {},
      );
    },
  };
}
export function downloadFile(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
