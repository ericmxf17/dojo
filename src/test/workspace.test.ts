import { describe, it, expect, beforeEach } from "vitest";
import { createSampleApi } from "@/lib/sidework/api";
import { seedState } from "@/lib/sidework/seed";
import {
  combineLabor,
  createWorkspaceApi,
  dates,
  validDocumentSize,
  transitions,
} from "@/lib/sidework/workspace-api";
import { PROVIDERS } from "@/lib/sidework/workspace-types";
describe("Owner workspace rules", () => {
  beforeEach(() => localStorage.removeItem("sidework.workspace.v1"));
  it("preserves Nov 9 service totals", async () => {
    const api = createWorkspaceApi(createSampleApi(), "");
    const s = await api.serviceSummary("2026-11-09");
    expect(s.net_sales_cents).toBe(102000);
    expect(s.total_hours).toBe("16");
    expect(s.estimated_base_wages_cents).toBe(32000);
    expect(
      Math.round((Number(s.estimated_base_wages_cents) / Number(s.net_sales_cents)) * 10000) / 100,
    ).toBe(31.37);
  });
  it("combines employee rows over both inclusive dates", () => {
    const r = combineLabor(
      seedState().records.filter((r) => r.kind === "labor"),
      "2026-11-08",
      "2026-11-09",
    );
    expect(r.total_hours).toBe("30");
    expect(r.employees.map((e) => [e.employee, e.hours, e.base_wages_cents])).toEqual([
      ["Avery", "15", 30000],
      ["Jordan", "15", 30000],
    ]);
  });
  it("keeps missing service values null", async () => {
    const s = await createWorkspaceApi(createSampleApi(), "").serviceSummary("2026-11-01");
    expect(s.net_sales_cents).toBeNull();
    expect(s.total_hours).toBeNull();
  });
  it("accepts 10 MB documents and rejects larger files", () => {
    expect(() => validDocumentSize(10_000_000)).not.toThrow();
    expect(() => validDocumentSize(10_000_001)).toThrow();
    expect(() => validDocumentSize(0)).toThrow();
  });
  it("rejects inverted payroll periods", () =>
    expect(() => combineLabor([], "2026-11-09", "2026-11-08")).toThrow());
  it("generates recurring drafts once and replaces projections", async () => {
    const w = createWorkspaceApi(createSampleApi(), "");
    const s = await w.createSchedule({
      supplier: "Test supplier",
      first_due_on: "2026-11-09",
      every_days: 7,
      until: "2026-11-23",
      lines: [{ ingredient: "Limes", quantity: "3", unit: "lb", unit_cost_cents: null }],
      notes: "",
      active: true,
    });
    expect(
      (await w.calendar("2026-11-09", "2026-11-23")).filter((i) => i.resource_id === s.id),
    ).toHaveLength(3);
    expect((await w.generate(s.id, "2026-11-23")).created_order_ids).toHaveLength(3);
    expect((await w.generate(s.id, "2026-11-23")).created_order_ids).toHaveLength(0);
    expect((await w.orders()).filter((o) => o.schedule_id === s.id)).toHaveLength(3);
    expect(
      (await w.calendar("2026-11-09", "2026-11-23")).filter((i) => i.resource_id === s.id),
    ).toHaveLength(0);
  });
  it("permits only backend order transitions and idempotent repeats", async () => {
    expect(transitions.draft).toEqual(["placed", "cancelled"]);
    const w = createWorkspaceApi(createSampleApi(), "");
    const o = await w.createOrder({
      supplier: "Test",
      due_on: "2026-11-09",
      lines: [{ ingredient: "Lemon", quantity: "1", unit: "lb", unit_cost_cents: null }],
      notes: "",
    });
    await expect(w.orderStatus(o.id, "received")).rejects.toThrow();
    await w.orderStatus(o.id, "placed");
    await expect(w.orderStatus(o.id, "placed")).resolves.toMatchObject({ status: "placed" });
  });
  it("has no supported Resy record categories", () =>
    expect(PROVIDERS.find((p) => p.id === "resy")?.kinds).toEqual([]));
  it("validates recurring-order intervals and one-year bound", () => {
    expect(dates("2026-11-09", "2026-11-23", 7)).toEqual([
      "2026-11-09",
      "2026-11-16",
      "2026-11-23",
    ]);
    expect(() => dates("2026-11-09", "2027-12-09", 7)).toThrow();
    expect(() => dates("2026-11-09", "2026-11-23", 0)).toThrow();
  });
});

describe("Calendar recurrence matches the backend", () => {
  it("skips months without the 31st", async () => {
    const { eventDates } = await import("@/lib/sidework/recurrence");
    expect(
      eventDates(
        {
          title: "Review",
          date: "2026-01-31",
          kind: "event",
          notes: "",
          repeat: "monthly",
          repeat_until: null,
          active: true,
        },
        "2026-01-01",
        "2026-04-30",
      ),
    ).toEqual(["2026-01-31", "2026-03-31"]);
  });
  it("skips non-leap years for February 29", async () => {
    const { eventDates } = await import("@/lib/sidework/recurrence");
    expect(
      eventDates(
        {
          title: "Review",
          date: "2024-02-29",
          kind: "event",
          notes: "",
          repeat: "yearly",
          repeat_until: null,
          active: true,
        },
        "2024-01-01",
        "2028-12-31",
      ),
    ).toEqual(["2024-02-29", "2028-02-29"]);
  });
});
