import { normalizeData } from "./live-contract";
import type { ImportError, ImportTemplate, RecordData, RecordKind } from "./types";

export const MAX_FILE_BYTES = 2_000_000;
export const MAX_RECORDS = 10_000;

type FieldType = "string" | "date" | "money" | "number";
interface FieldSpec {
  name: string;
  type: FieldType;
  required: boolean;
}

export const SCHEMAS: Record<RecordKind, FieldSpec[]> = {
  sales: [
    { name: "external_id", type: "string", required: true },
    { name: "date", type: "date", required: true },
    { name: "item", type: "string", required: true },
    { name: "quantity", type: "number", required: true },
    { name: "net_sales", type: "money", required: true },
  ],
  purchases: [
    { name: "external_id", type: "string", required: true },
    { name: "date", type: "date", required: true },
    { name: "supplier", type: "string", required: true },
    { name: "ingredient", type: "string", required: true },
    { name: "quantity", type: "number", required: true },
    { name: "unit", type: "string", required: true },
    { name: "total_cost", type: "money", required: true },
  ],
  labor: [
    { name: "external_id", type: "string", required: true },
    { name: "date", type: "date", required: true },
    { name: "employee", type: "string", required: true },
    { name: "hours", type: "number", required: true },
    { name: "hourly_rate", type: "money", required: true },
  ],
  inventory: [
    { name: "external_id", type: "string", required: true },
    { name: "date", type: "date", required: true },
    { name: "ingredient", type: "string", required: true },
    { name: "quantity", type: "number", required: true },
    { name: "unit", type: "string", required: true },
    { name: "expires_on", type: "date", required: false },
    { name: "low_stock_threshold", type: "number", required: true },
  ],
};

const EXAMPLES: Record<RecordKind, string[][]> = {
  sales: [["S-1001", "2026-11-10", "Latte", "100", "600.00"]],
  purchases: [["P-1001", "2026-11-10", "Local Dairy", "Milk", "20", "l", "72.00"]],
  labor: [["L-1001", "2026-11-10", "Avery", "8", "20.00"]],
  inventory: [["I-1001", "2026-11-10", "Milk", "4", "l", "2026-11-12", "5"]],
};

export function sampleTemplates(): ImportTemplate[] {
  return (Object.keys(SCHEMAS) as RecordKind[]).map((kind) => ({
    kind,
    filename: `side-work-${kind}-template.csv`,
    headers: SCHEMAS[kind].map((f) => f.name),
    example_rows: EXAMPLES[kind],
  }));
}

export function templateCsv(t: ImportTemplate): string {
  const lines = [t.headers.join(",")];
  for (const r of t.example_rows ?? []) lines.push(r.map(csvEscape).join(","));
  return lines.join("\n") + "\n";
}

function csvEscape(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** RFC 4180-style parser. Returns rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const t = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (inQuotes) throw new Error("Unclosed quoted field in CSV.");
  return rows.filter((r) => !(r.length === 1 && (r[0] ?? "").trim() === ""));
}

function isValidDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y = 0, m = 0, d = 0] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export interface ValidationResult {
  rows: { row_number: number; data: RecordData }[];
  errors: ImportError[];
}

/** Validates and normalizes a CSV for a record kind. Row numbers count the header as row 1. */
export function validateCsv(kind: RecordKind, text: string): ValidationResult {
  const errors: ImportError[] = [];
  const out: ValidationResult["rows"] = [];
  if (text.includes("\uFFFD")) {
    errors.push({ row: null, message: "The file does not appear to be UTF-8 text. Save it as “CSV UTF-8” and try again." });
    return { rows: out, errors };
  }
  let table: string[][];
  try { table = parseCsv(text); } catch (e) {
    return { rows: out, errors: [{ row: null, message: e instanceof Error ? e.message : "Invalid CSV" }] };
  }
  if (table.length === 0) {
    errors.push({ row: null, message: "The file is empty." });
    return { rows: out, errors };
  }
  const header = table[0] ?? [];
  const schema = SCHEMAS[kind];
  const missing = schema.filter((f) => f.required && !header.includes(f.name)).map((f) => f.name);
  if (missing.length || new Set(header).size !== header.length || header.length !== schema.length || header.some(h => !schema.some(f => f.name === h))) {
    errors.push({ row: 1, message: `Headers must exactly match: ${schema.map(f => f.name).join(", ")}. Download the template for the expected headers.` });
    return { rows: out, errors };
  }
  const body = table.slice(1);
  if (body.length === 0) errors.push({ row: null, message: "The file has headers but no records." });
  if (body.length > MAX_RECORDS) {
    errors.push({ row: null, message: `The file has ${body.length.toLocaleString()} records. The limit is ${MAX_RECORDS.toLocaleString()}.` });
    return { rows: out, errors };
  }
  const seen = new Map<string, number>();
  body.forEach((cells, i) => {
    const rowNumber = i + 2;
    if (cells.length !== header.length) {
      errors.push({ row: rowNumber, message: `Expected ${header.length} columns but found ${cells.length}.` });
      return;
    }
    const data: RecordData = {};
    for (const f of schema) {
      const idx = header.indexOf(f.name);
      const raw = idx >= 0 ? (cells[idx] ?? "").trim() : "";
      if (raw === "") {
        if (f.required) errors.push({ row: rowNumber, field: f.name, message: `${f.name} is required.` });
        data[f.name] = null;
        continue;
      }
      if (f.type === "date") {
        if (!isValidDate(raw)) errors.push({ row: rowNumber, field: f.name, message: `“${raw}” is not a valid date. Use YYYY-MM-DD.` });
        data[f.name] = raw;
      } else if (f.type === "money") {
        const n = Number(raw);
        if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || !Number.isFinite(n) || n > 1_000_000_000) errors.push({ row: rowNumber, field: f.name, message: `${f.name} must be a nonnegative dollar amount with at most two decimals.` });
        data[f.name === "net_sales" ? "net_sales_cents" : f.name === "total_cost" ? "total_cost_cents" : "hourly_rate_cents"] = Math.round(n * 100);
      } else if (f.type === "number") {
        const n = Number(raw);
        if (!Number.isFinite(n)) errors.push({ row: rowNumber, field: f.name, message: `“${raw}” is not a number.` });
        else if (n < 0 || n > 1_000_000_000) errors.push({ row: rowNumber, field: f.name, message: `${f.name} cannot be negative.` });
        if (f.name === "quantity" && kind !== "inventory" && n === 0) errors.push({ row: rowNumber, field: f.name, message: "quantity must be positive." });
        if (f.name === "hours" && n > 24) errors.push({ row: rowNumber, field: f.name, message: "hours cannot exceed 24 per record." });
        data[f.name] = n;
      } else {
        if (raw.length > 250) errors.push({ row: rowNumber, field: f.name, message: `${f.name} exceeds 250 characters.` });
        data[f.name] = f.name === "unit" ? raw.toLowerCase() : raw;
      }
    }
    const ext = String(data.external_id ?? "");
    if (ext) {
      if (seen.has(ext)) errors.push({ row: rowNumber, field: "external_id", message: `external_id “${ext}” also appears on row ${seen.get(ext)}.` });
      else seen.set(ext, rowNumber);
    }
    out.push({ row_number: rowNumber, data: normalizeData(kind, data) });
  });
  return { rows: out, errors };
}
