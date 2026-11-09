/** Translate the FastAPI wire contract once, at the service boundary. */
import { daysBetween } from './format';
const SUPPORTED_QUESTIONS = ['What were sales?', 'What were labor costs?', 'What were purchases?', 'What needs attention today?'];
import type { Alert, AskResponse, Briefing, ImportPreview, InventoryResponse, RecordData, RecordKind, SourceRef, StoredRecord } from './types';

export interface WireRecord { kind: RecordKind; data: RecordData; source: SourceRef }
interface WireAlert { type: string; severity: string; message: string; sources: SourceRef[]; change_percent?: number }
export interface WireImport extends Omit<ImportPreview, 'status' | 'preview' | 'errors'> {
  status: 'preview' | 'invalid' | 'committed';
  preview: { row_number: number; data: RecordData }[];
  errors: { row_number: number | null; message: string }[];
}
export interface WireInventory {
  as_of: string;
  items: { ingredient: string; unit: string; quantity: string; snapshot_date: string; batches: { data: RecordData; source: SourceRef }[] }[];
}
export interface WireBriefing extends Omit<Briefing, 'alerts' | 'inventory_as_of'> {
  alerts: WireAlert[];
  inventory_as_of: { ingredient: string; unit: string; snapshot_date: string; sources: SourceRef[] }[];
}

export function normalizeData(kind: RecordKind, p: RecordData): RecordData {
  const { date, supplier, ingredient, total_cost_cents, expires_on, ...rest } = p;
  const data: RecordData = { ...rest };
  if (kind === 'inventory') {
    data.snapshot_date = date ?? null;
    data.ingredient = ingredient ?? null;
    data.expiration_date = expires_on || null;
  } else {
    data.business_date = date ?? null;
    if (kind === 'purchases') {
      data.vendor = supplier ?? null;
      data.item = ingredient ?? null;
      data.total_cents = total_cost_cents ?? null;
    }
  }
  for (const field of ['quantity', 'hours', 'low_stock_threshold']) {
    if (data[field] != null && data[field] !== '') data[field] = Number(data[field]);
  }
  return data;
}

export function normalizeRecord(r: WireRecord): StoredRecord {
  return { ...r, id: r.source.record_id, data: normalizeData(r.kind, r.data) };
}
function utcTimestamp(value: string): string {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value;
}
export function normalizeImport(p: WireImport): ImportPreview {
  return { ...p,
    created_at: p.created_at ? utcTimestamp(p.created_at) : null,
    committed_at: p.committed_at ? utcTimestamp(p.committed_at) : null,
    status: p.status === 'preview' ? 'previewed' : p.status,
    errors: p.errors.map(e => ({ row: e.row_number, message: e.message })),
    preview: p.preview.map(r => normalizeData(p.kind, r.data)) };
}
export function normalizeAlert(a: WireAlert, index: number): Alert {
  const titles: Record<string, string> = {
    low_stock: 'Recorded stock is at or below its threshold',
    expiring_soon: 'Recorded expiration approaching',
    past_recorded_expiration: 'Recorded expiration date has passed',
    supplier_price_increase: `Supplier price increased${a.change_percent == null ? '' : ` ${a.change_percent}%`}`,
  };
  return { ...a, id: `${a.type}-${a.sources.map(s => s.record_id).join('-')}-${index}`,
    title: titles[a.type] ?? 'Check imported records',
    severity: a.severity === 'warning' ? 'medium' : 'low' };
}
export function normalizeBriefing(b: WireBriefing): Briefing {
  const dates = b.inventory_as_of.map(s => s.snapshot_date).sort();
  const missing = [...b.missing_data];
  if (!dates.length || dates.some(d => d !== b.date)) missing.push('inventory');
  return { ...b, inventory_as_of: dates.at(-1) ?? null, missing_data: missing, alerts: b.alerts.map(normalizeAlert) };
}
export function normalizeInventory(v: WireInventory, on: string): InventoryResponse {
  const items = v.items.map(item => {
    const batches = item.batches.map(b => ({ record_id: b.source.record_id, batch_id: b.source.external_id,
      quantity: Number(b.data.quantity), expiration_date: String(b.data["expires_on"] || '') || null, source: b.source }));
    const threshold = Math.max(...item.batches.map(b => Number(b.data.low_stock_threshold)));
    const expiration_dates = [...new Set(batches.filter(b => b.quantity > 0 && b.expiration_date).map(b => b.expiration_date!))].sort();
    const statuses: import('./types').InventoryStatus[] = [];
    if (Number(item.quantity) <= threshold) statuses.push('low_stock');
    if (expiration_dates.some(d => d < on)) statuses.push('expiration_passed');
    if (expiration_dates.some(d => d >= on && daysBetween(on, d) <= 3)) statuses.push('expiration_approaching');
    if (!statuses.length) statuses.push('ok');
    return { ...item, quantity: Number(item.quantity), low_stock_threshold: threshold,
      batches, sources: batches.map(b => b.source), expiration_dates, statuses };
  });
  return { as_of: items.map(i => i.snapshot_date).sort().at(-1) ?? null, items };
}
export function normalizeAnswer(r: Omit<AskResponse, 'question' | 'on' | 'supported_questions'> & { examples?: string[] }, question: string, on: string): AskResponse {
  return { ...r, question, on, supported_questions: r.examples ?? SUPPORTED_QUESTIONS };
}
