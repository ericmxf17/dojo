// Pure computations over a set of records. Used by Sample data mode (and tests).
import { addDays, daysBetween, formatCents, formatDate, formatPercent } from "./format";
import type {
  Alert,
  AskResponse,
  Briefing,
  BriefingMetrics,
  ImportPreview,
  InventoryItem,
  InventoryResponse,
  InventoryStatus,
  MetricChange,
  MoneyMetric,
  RecordKind,
  StoredRecord,
} from "./types";

export interface SampleState {
  records: StoredRecord[];
  imports: (ImportPreview & {
    file_hash: string;
    pending_rows?: { row_number: number; data: StoredRecord["data"] }[];
  })[];
}

export const EXPIRATION_WINDOW_DAYS = 3;
export const PRICE_CHANGE_ALERT_PERCENT = 0;

export function recordDate(r: StoredRecord): string {
  return String(r.kind === "inventory" ? r.data.snapshot_date : r.data.business_date);
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

function money(records: StoredRecord[], value: (r: StoredRecord) => number): MoneyMetric {
  if (records.length === 0) return { amount_cents: null, record_count: 0, sources: [] };
  return {
    amount_cents: Math.round(records.reduce((s, r) => s + value(r), 0)),
    record_count: records.length,
    sources: records.map((r) => r.source),
  };
}

export function computeMetrics(state: SampleState, on: string): BriefingMetrics {
  const day = state.records.filter((r) => r.kind !== "inventory" && recordDate(r) === on);
  const sales = money(
    day.filter((r) => r.kind === "sales"),
    (r) => num(r.data.net_sales_cents),
  );
  const wages = money(
    day.filter((r) => r.kind === "labor"),
    (r) => Math.round(num(r.data.hours) * num(r.data.hourly_rate_cents)),
  );
  const purchases = money(
    day.filter((r) => r.kind === "purchases"),
    (r) => num(r.data.total_cents),
  );
  const ratio =
    sales.amount_cents && wages.amount_cents !== null
      ? Math.round((wages.amount_cents / sales.amount_cents) * 10000) / 100
      : null;
  return {
    net_sales: sales,
    estimated_wages: wages,
    recorded_purchases: purchases,
    estimated_wage_to_sales_percent: ratio,
  };
}

function change(cur: MoneyMetric, prev: MoneyMetric): MetricChange {
  if (cur.amount_cents === null || prev.amount_cents === null)
    return { amount_cents: null, percent: null };
  const delta = cur.amount_cents - prev.amount_cents;
  return {
    amount_cents: delta,
    percent: prev.amount_cents === 0 ? null : Math.round((delta / prev.amount_cents) * 10000) / 100,
  };
}

/** Latest inventory snapshot date on or before `on`. */
export function inventoryAsOf(state: SampleState, on: string): string | null {
  const dates = state.records
    .filter((r) => r.kind === "inventory" && recordDate(r) <= on)
    .map(recordDate);
  return dates.length ? (dates.sort().at(-1) ?? null) : null;
}

export function computeInventory(state: SampleState, on: string): InventoryResponse {
  const asOf = inventoryAsOf(state, on);
  if (!asOf) return { as_of: null, items: [] };
  const candidates = state.records.filter((r) => r.kind === "inventory" && recordDate(r) <= on);
  const latest = new Map<string, string>();
  const groupKey = (r: StoredRecord) =>
    `${String(r.data.ingredient).toLowerCase()}|${String(r.data.unit).toLowerCase()}`;
  for (const r of candidates)
    if (!latest.has(groupKey(r)) || recordDate(r) > (latest.get(groupKey(r)) ?? ""))
      latest.set(groupKey(r), recordDate(r));
  const snap = candidates.filter((r) => recordDate(r) === latest.get(groupKey(r)));
  const groups = new Map<string, StoredRecord[]>();
  for (const r of snap) {
    const key = `${String(r.data.ingredient).toLowerCase()}|${String(r.data.unit).toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const items: InventoryItem[] = [];
  for (const recs of groups.values()) {
    const first = recs[0];
    if (!first) continue;
    const quantity = recs.reduce((s, r) => s + num(r.data.quantity), 0);
    const thresholds = recs
      .map((r) => r.data.low_stock_threshold)
      .filter((v) => v !== null && v !== undefined)
      .map(num);
    const threshold = thresholds.length ? Math.max(...thresholds) : null;
    const exp = [
      ...new Set(
        recs
          .filter((r) => num(r.data.quantity) > 0)
          .map((r) => r.data.expiration_date)
          .filter(Boolean)
          .map(String),
      ),
    ].sort();
    const statuses: InventoryStatus[] = [];
    if (threshold !== null && quantity <= threshold) statuses.push("low_stock");
    if (exp.some((d) => d < on)) statuses.push("expiration_passed");
    if (exp.some((d) => d >= on && daysBetween(on, d) <= EXPIRATION_WINDOW_DAYS))
      statuses.push("expiration_approaching");
    if (!statuses.length) statuses.push("ok");
    items.push({
      ingredient: String(recs[0]?.data.ingredient),
      unit: String(recs[0]?.data.unit),
      quantity: Math.round(quantity * 1000) / 1000,
      low_stock_threshold: threshold,
      snapshot_date: recordDate(first),
      expiration_dates: exp,
      statuses,
      batches: recs.map((r) => ({
        record_id: r.id,
        batch_id: (r.data.batch_id as string) ?? null,
        quantity: num(r.data.quantity),
        expiration_date: (r.data.expiration_date as string) ?? null,
        source: r.source,
      })),
      sources: recs.map((r) => r.source),
    });
  }
  items.sort((a, b) => a.ingredient.localeCompare(b.ingredient));
  return { as_of: asOf, items };
}

export function computeAlerts(state: SampleState, on: string): Alert[] {
  const alerts: Alert[] = [];
  const inv = computeInventory(state, on);
  for (const it of inv.items) {
    const slug = it.ingredient.toLowerCase().replace(/\W+/g, "-");
    if (it.statuses.includes("low_stock")) {
      alerts.push({
        id: `low-${slug}-${it.unit}`,
        type: "low_stock",
        severity: "high",
        title: `${it.ingredient} is at or below its low-stock threshold`,
        message: `Recorded quantity is ${it.quantity} ${it.unit} as of ${formatDate(it.snapshot_date)}; the threshold is ${it.low_stock_threshold} ${it.unit}.`,
        sources: it.sources,
      });
    }
    for (const d of it.expiration_dates) {
      const days = daysBetween(on, d);
      const batchSources = it.batches.filter((b) => b.expiration_date === d).map((b) => b.source);
      if (days < 0) {
        alerts.push({
          id: `expired-${slug}-${d}`,
          type: "expiration_passed",
          severity: "high",
          title: `${it.ingredient}: recorded expiration date has passed`,
          message: `A batch was recorded with an expiration of ${formatDate(d)}. Please check the item directly.`,
          sources: batchSources,
        });
      } else if (days <= EXPIRATION_WINDOW_DAYS) {
        alerts.push({
          id: `exp-${slug}-${d}`,
          type: "expiration_approaching",
          severity: "medium",
          title: `${it.ingredient}: recorded expiration approaching`,
          message: `A batch was recorded with an expiration of ${formatDate(d)}${days === 0 ? " (the selected date)" : `, ${days} day${days > 1 ? "s" : ""} after the selected date`}.`,
          sources: batchSources,
        });
      }
    }
  }
  // Purchase unit-price changes vs the most recent earlier purchase of the same vendor/item/unit.
  const purchases = state.records.filter((r) => r.kind === "purchases");
  const today = purchases.filter((r) => recordDate(r) === on);
  const seen = new Set<string>();
  for (const r of today) {
    const key = `${r.data.vendor}|${r.data.item}|${r.data.unit}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const same = (x: StoredRecord) =>
      `${x.data.vendor}|${x.data.item}|${x.data.unit}`.toLowerCase() === key;
    const todays = today.filter(same);
    const earlier = purchases.filter((x) => same(x) && recordDate(x) < on);
    if (!earlier.length) continue;
    const prevDate = earlier.map(recordDate).sort().at(-1) ?? on;
    const prev = earlier.filter((x) => recordDate(x) === prevDate);
    const unitPrice = (rs: StoredRecord[]) =>
      rs.reduce((s, x) => s + num(x.data.total_cents), 0) /
      rs.reduce((s, x) => s + num(x.data.quantity), 0);
    const cur = unitPrice(todays);
    const old = unitPrice(prev);
    if (!old) continue;
    const pct = ((cur - old) / old) * 100;
    if (pct > PRICE_CHANGE_ALERT_PERCENT) {
      alerts.push({
        id: `price-${key.replace(/\W+/g, "-")}`,
        type: "price_increase",
        severity: "medium",
        title: `${r.data.item} purchase price increased ${Math.round(pct)}%`,
        message: `${r.data.vendor}: ${formatCents(Math.round(cur))} per ${r.data.unit} on ${formatDate(on)}, up from ${formatCents(Math.round(old))} per ${r.data.unit} on ${formatDate(prevDate)}.`,
        sources: [...prev, ...todays].map((x) => x.source),
      });
    }
  }
  const order = { high: 0, medium: 1, low: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function computeBriefing(state: SampleState, on: string): Briefing {
  const metrics = computeMetrics(state, on);
  const prevDate = addDays(on, -1);
  const prevMetrics = computeMetrics(state, prevDate);
  const hasPrev =
    prevMetrics.net_sales.record_count +
      prevMetrics.estimated_wages.record_count +
      prevMetrics.recorded_purchases.record_count >
    0;
  const missing: string[] = [];
  if (!metrics.net_sales.record_count) missing.push("sales");
  if (!metrics.estimated_wages.record_count) missing.push("labor");
  if (!metrics.recorded_purchases.record_count) missing.push("purchases");
  const asOf = inventoryAsOf(state, on);
  if (asOf !== on) missing.push("inventory");
  return {
    date: on,
    currency: "USD",
    metrics,
    previous_day: hasPrev ? { date: prevDate, metrics: prevMetrics } : null,
    changes_vs_previous_day: hasPrev
      ? {
          net_sales: change(metrics.net_sales, prevMetrics.net_sales),
          estimated_wages: change(metrics.estimated_wages, prevMetrics.estimated_wages),
          recorded_purchases: change(metrics.recorded_purchases, prevMetrics.recorded_purchases),
        }
      : {},
    alerts: computeAlerts(state, on),
    missing_data: missing,
    inventory_as_of: asOf,
    limitations: [
      "Recorded purchases are not cost of goods sold.",
      "Estimated base wages are hours × hourly rate and exclude taxes, benefits, tips, and other payroll overhead.",
      "Inventory reflects recorded snapshots, not live stock levels.",
    ],
  };
}

export const SUPPORTED_QUESTIONS = [
  "What were sales?",
  "What were labor costs?",
  "What were purchases?",
  "What needs attention today?",
];

export function answerQuestion(state: SampleState, question: string, on: string): AskResponse {
  const q = question
    .toLowerCase()
    .trim()
    .replace(/[?.!]+$/, "");
  const b = computeBriefing(state, on);
  const base = { question, on, supported_questions: SUPPORTED_QUESTIONS };
  const d = formatDate(on);
  const metricAnswer = (label: string, m: MoneyMetric, kind: string) =>
    m.amount_cents === null
      ? {
          ...base,
          supported: true,
          answer: `No ${kind} records are imported for ${d}, so I can't report ${label}.`,
          sources: [],
        }
      : {
          ...base,
          supported: true,
          answer: `${label.charAt(0).toUpperCase() + label.slice(1)} for ${d} were ${formatCents(m.amount_cents)}, from ${m.record_count} record${m.record_count === 1 ? "" : "s"}.`,
          sources: m.sources,
        };
  if (["what needs attention today", "what needs attention", "show alerts"].includes(q)) {
    if (!b.alerts.length)
      return {
        ...base,
        supported: true,
        answer: `Nothing in the imported records needs attention for ${d}.`,
        sources: [],
      };
    return {
      ...base,
      supported: true,
      answer:
        `${b.alerts.length} item${b.alerts.length > 1 ? "s need" : " needs"} attention for ${d}:\n` +
        b.alerts.map((a) => `• ${a.title}. ${a.message}`).join("\n"),
      sources: b.alerts.flatMap((a) => a.sources),
    };
  }
  if (
    [
      "what were labor costs",
      "what were labour costs",
      "show wages",
      "labor costs",
      "what were wages",
    ].includes(q)
  ) {
    const r = metricAnswer("estimated base wages", b.metrics.estimated_wages, "employee hours");
    if (b.metrics.estimated_wage_to_sales_percent !== null)
      r.answer += ` That is ${formatPercent(b.metrics.estimated_wage_to_sales_percent)} of net sales. This excludes payroll overhead.`;
    return r;
  }
  if (
    ["what were purchases", "show purchases", "purchases", "what was supplier spend"].includes(q)
  ) {
    const r = metricAnswer("recorded purchases", b.metrics.recorded_purchases, "purchase");
    if (r.sources.length) r.answer += " Purchases are not cost of goods sold.";
    return r;
  }
  if (
    [
      "what were sales",
      "what were sales today",
      "show sales",
      "sales",
      "what was revenue",
    ].includes(q)
  )
    return metricAnswer("net sales", b.metrics.net_sales, "sales");
  return {
    ...base,
    supported: false,
    answer:
      "Side Work can only answer a few specific questions about your imported records right now. Try one of the supported questions below.",
    sources: [],
  };
}

export function listRecords(
  state: SampleState,
  kind: RecordKind,
  on: string | null,
  limit: number,
  offset: number,
) {
  const all = state.records.filter((r) => r.kind === kind && (!on || recordDate(r) === on));
  all.sort(
    (a, b) =>
      recordDate(a).localeCompare(recordDate(b)) || a.source.row_number - b.source.row_number,
  );
  return { total: all.length, records: all.slice(offset, offset + limit) };
}
