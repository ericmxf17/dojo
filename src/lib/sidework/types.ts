// Shared TypeScript interfaces used by both Sample data and Connected API modes.

export type RecordKind = "sales" | "purchases" | "labor" | "inventory";

export const RECORD_KINDS: { kind: RecordKind; label: string }[] = [
  { kind: "sales", label: "Sales" },
  { kind: "purchases", label: "Purchases" },
  { kind: "labor", label: "Employee hours" },
  { kind: "inventory", label: "Inventory" },
];

export function kindLabel(kind: RecordKind | string): string {
  return RECORD_KINDS.find((k) => k.kind === kind)?.label ?? String(kind);
}

export interface SourceRef {
  record_id: string;
  import_id: string;
  filename: string;
  row_number: number;
  external_id: string;
  url?: string | null;
}

export interface MoneyMetric {
  amount_cents: number | null;
  record_count: number;
  sources: SourceRef[];
}

export interface BriefingMetrics {
  net_sales: MoneyMetric;
  estimated_wages: MoneyMetric;
  recorded_purchases: MoneyMetric;
  /** Percentage (e.g. 31.37). Null when sales or wages are missing. */
  estimated_wage_to_sales_percent: number | null;
}

export interface MetricChange {
  amount_cents: number | null;
  percent: number | null;
}

export type AlertSeverity = "high" | "medium" | "low";

export interface Alert {
  id: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  sources: SourceRef[];
}

export interface Briefing {
  date: string;
  currency: string;
  metrics: BriefingMetrics;
  previous_day: { date: string; metrics: BriefingMetrics } | null;
  changes_vs_previous_day: Partial<
    Record<"net_sales" | "estimated_wages" | "recorded_purchases", MetricChange>
  >;
  alerts: Alert[];
  missing_data: string[];
  inventory_as_of: string | null;
  limitations: string[];
}

export type RecordValue = string | number | null;

/** Normalized record fields. Known fields are listed so they can be read with dot access. */
export interface RecordData {
  [field: string]: RecordValue | undefined;
  external_id?: RecordValue;
  business_date?: RecordValue;
  snapshot_date?: RecordValue;
  item?: RecordValue;
  quantity?: RecordValue;
  unit?: RecordValue;
  vendor?: RecordValue;
  employee?: RecordValue;
  hours?: RecordValue;
  hourly_rate_cents?: RecordValue;
  net_sales_cents?: RecordValue;
  total_cents?: RecordValue;
  ingredient?: RecordValue;
  low_stock_threshold?: RecordValue;
  expiration_date?: RecordValue;
  batch_id?: RecordValue;
}

export interface StoredRecord {
  id: string;
  kind: RecordKind;
  data: RecordData;
  source: SourceRef;
}

export interface RecordList {
  total: number;
  records: StoredRecord[];
}

export interface ImportError {
  row: number | null;
  field?: string | null;
  message: string;
}

export type ImportStatus = "previewed" | "invalid" | "committed";

export interface ImportPreview {
  id: string;
  kind: RecordKind;
  filename: string;
  status: ImportStatus;
  errors: ImportError[];
  row_count: number;
  preview: RecordData[];
  created_at?: string | null;
  committed_at?: string | null;
}

export interface ImportTemplate {
  kind: RecordKind;
  filename: string;
  headers: string[];
  example_rows?: string[][];
}

export interface InventoryBatch {
  record_id: string;
  batch_id: string | null;
  quantity: number;
  expiration_date: string | null;
  source: SourceRef;
}

export type InventoryStatus = "ok" | "low_stock" | "expiration_approaching" | "expiration_passed";

export interface InventoryItem {
  ingredient: string;
  unit: string;
  quantity: number;
  low_stock_threshold: number | null;
  snapshot_date: string;
  expiration_dates: string[];
  statuses: InventoryStatus[];
  batches: InventoryBatch[];
  sources: SourceRef[];
}

export interface InventoryResponse {
  as_of: string | null;
  items: InventoryItem[];
}

export interface AskResponse {
  question: string;
  on: string;
  supported: boolean;
  answer: string;
  sources: SourceRef[];
  supported_questions: string[];
}

export interface Integration {
  id: string;
  name: string;
  status: "available" | "not_connected" | "connected";
  description: string;
}

export interface Health {
  status: string;
}
