import type { SourceRef, StoredRecord, RecordKind, ImportPreview } from "./types";
export type Resource = { id: string; created_at?: string; updated_at?: string };
export type Adjustment = {
  employee: string;
  tips_cents: number;
  bonus_cents: number;
  reimbursement_cents: number;
};
export type PayrollEmployee = Adjustment & {
  hours: string;
  base_wages_cents: number;
  estimated_total_cents: number;
  sources: SourceRef[];
};
export type PayrollReport = {
  id?: string;
  start: string;
  end: string;
  employees: PayrollEmployee[];
  total_hours: string;
  totals: { base_wages_cents: number; estimated_total_cents: number };
  missing_data: boolean;
  created_at?: string;
};
export type DocumentInput = {
  title: string;
  category: string;
  deadline: string | null;
  notes: string;
  status: "active" | "archived";
};
export type Version = {
  id: string;
  filename: string;
  version: number;
  size_bytes: number;
  created_at?: string;
};
export type CabinetDocument = Resource & DocumentInput & { versions?: Version[] };
export type EventInput = {
  title: string;
  date: string;
  kind: "event" | "holiday" | "deadline";
  notes: string;
  repeat: "none" | "weekly" | "monthly" | "yearly";
  repeat_until: string | null;
  active: boolean;
};
export type CalendarEvent = Resource & EventInput;
export type Line = {
  ingredient: string;
  quantity: string;
  unit: string;
  unit_cost_cents: number | null;
};
export type OrderInput = { supplier: string; due_on: string; lines: Line[]; notes: string };
export type Status = "draft" | "placed" | "confirmed" | "received" | "cancelled";
export type Order = Resource & OrderInput & { status: Status; schedule_id?: string | null };
export type ScheduleInput = {
  supplier: string;
  first_due_on: string;
  every_days: number;
  until: string;
  lines: Line[];
  notes: string;
  active: boolean;
};
export type Schedule = Resource & ScheduleInput;
export type CalendarItem = {
  id: string;
  date: string;
  title: string;
  kind: string;
  resource_id: string;
  notes?: string;
  status?: string;
};
export type Provider = { id: string; name: string; description: string; kinds: RecordKind[] };
export const PROVIDERS: Provider[] = [
  {
    id: "toast",
    name: "Toast",
    description: "Restaurant POS & operations",
    kinds: ["sales", "labor"],
  },
  { id: "7shifts", name: "7shifts", description: "Scheduling & labor", kinds: ["labor"] },
  {
    id: "marketman",
    name: "MarketMan",
    description: "Inventory & purchasing",
    kinds: ["inventory", "purchases"],
  },
  {
    id: "restaurant365",
    name: "Restaurant365",
    description: "Accounting & operational data",
    kinds: ["sales", "labor", "purchases", "inventory"],
  },
  { id: "resy", name: "Resy", description: "Reservations & guest management", kinds: [] },
];
export type ServiceSummary = {
  date: string;
  net_sales_cents: number | null;
  total_hours: string | null;
  estimated_base_wages_cents: number | null;
  sales_sources: SourceRef[];
  labor_sources: SourceRef[];
};
export interface WorkspaceApi {
  serviceSummary(on: string): Promise<ServiceSummary>;
  payrollPreview(start: string, end: string): Promise<PayrollReport>;
  createPayroll(
    start: string,
    end: string,
    adjustments: Adjustment[],
    key: string,
  ): Promise<PayrollReport>;
  payrollRuns(): Promise<PayrollReport[]>;
  exportPayroll(run: PayrollReport, format: "csv" | "html"): Promise<Blob>;
  documents(): Promise<CabinetDocument[]>;
  document(id: string): Promise<CabinetDocument>;
  saveDocument(input: DocumentInput, id?: string): Promise<CabinetDocument>;
  uploadVersion(id: string, file: File): Promise<Version>;
  downloadVersion(id: string, version: Version): Promise<Blob>;
  events(): Promise<CalendarEvent[]>;
  saveEvent(input: EventInput, id?: string): Promise<CalendarEvent>;
  calendar(start: string, end: string): Promise<CalendarItem[]>;
  orders(): Promise<Order[]>;
  createOrder(input: OrderInput): Promise<Order>;
  orderStatus(id: string, status: Status): Promise<Order>;
  schedules(): Promise<Schedule[]>;
  createSchedule(input: ScheduleInput): Promise<Schedule>;
  scheduleActive(id: string, active: boolean): Promise<Schedule>;
  generate(
    id: string,
    through: string,
  ): Promise<{ created_order_ids: string[]; existing_order_ids: string[] }>;
  provider(id: string, on: string): Promise<StoredRecord[]>;
  providerImport(id: string, kind: RecordKind, file: File): Promise<ImportPreview>;
}
