// Typed service layer. Both modes implement the same interface and return the same shapes.
import { MAX_FILE_BYTES, sampleTemplates, validateCsv } from "./csv";
import { answerQuestion, computeAlerts, computeBriefing, computeInventory, listRecords, type SampleState } from "./engine";
import { normalizeAlert, normalizeAnswer, normalizeBriefing, normalizeImport, normalizeInventory, normalizeRecord, type WireRecord, type WireImport, type WireBriefing, type WireInventory } from "./live-contract";
import { seedState } from "./seed";
import type {
  Alert,
  AskResponse,
  Briefing,
  Health,
  ImportPreview,
  ImportTemplate,
  Integration,
  InventoryResponse,
  RecordKind,
  RecordList,
  StoredRecord,
} from "./types";

export class ApiError extends Error {
  constructor(message: string, public status: number | null = null, public kind: "network" | "http" | "validation" = "http") {
    super(message);
    this.name = "ApiError";
  }
}

export interface SideWorkApi {
  mode: "sample" | "live";
  health(): Promise<Health>;
  templates(): Promise<ImportTemplate[]>;
  previewImport(kind: RecordKind, file: File): Promise<ImportPreview>;
  commitImport(importId: string): Promise<ImportPreview>;
  listImports(): Promise<ImportPreview[]>;
  getImport(importId: string): Promise<ImportPreview>;
  listRecords(kind: RecordKind, on: string | null, limit: number, offset: number): Promise<RecordList>;
  getRecord(recordId: string): Promise<StoredRecord>;
  briefing(on: string): Promise<Briefing>;
  inventory(on: string): Promise<InventoryResponse>;
  alerts(on: string): Promise<Alert[]>;
  ask(question: string, on: string): Promise<AskResponse>;
  integrations(): Promise<Integration[]>;
}

const INTEGRATIONS: Integration[] = [
  { id: "csv", name: "CSV imports", status: "available", description: "Upload sales, purchases, employee hours, and inventory as UTF-8 CSV files." },
  { id: "toast", name: "Toast", status: "not_connected", description: "Point-of-sale sales and labor data." },
  { id: "resy", name: "Resy", status: "not_connected", description: "Reservations and covers." },
];

/* ---------------- Sample data mode ---------------- */

const STORAGE_KEY = "sidework.sample.v1";
let sampleState: SampleState | null = null;

function loadState(): SampleState {
  if (sampleState) return sampleState;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) return (sampleState = JSON.parse(raw));
    } catch {
      /* fall through to seed */
    }
  }
  return (sampleState = seedState());
}

function saveState() {
  if (typeof window !== "undefined" && sampleState) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleState));
  }
}

export function resetSampleData() {
  sampleState = seedState();
  saveState();
}

const delay = <T,>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(v), ms));

function hashText(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}-${(h >>> 0).toString(16)}`;
}

function publicImport(i: SampleState["imports"][number]): ImportPreview {
  const { file_hash: _h, pending_rows: _p, ...rest } = i;
  return rest;
}

export function createSampleApi(): SideWorkApi {
  return {
    mode: "sample",
    health: () => delay({ status: "ok" }),
    templates: () => delay(sampleTemplates()),
    async previewImport(kind, file) {
      if (file.size > MAX_FILE_BYTES) throw new ApiError("This file is larger than 2 MB. Split it into smaller files and try again.", 413, "validation");
      if (!/\.csv$/i.test(file.name)) throw new ApiError("Only .csv files are supported. PDFs, photos, and spreadsheets can't be read.", 415, "validation");
      const text = await file.text();
      const s = loadState();
      const hash = hashText(`${kind}:${text}`);
      const { rows, errors } = validateCsv(kind, text);
      const dup = s.imports.find((i) => i.file_hash === hash && i.status === "committed");
      if (dup) errors.unshift({ row: null, message: `This exact file was already imported as “${dup.filename}”. Importing it again would double-count records.` });
      const existing = new Map(s.records.filter((r) => r.kind === kind).map((r) => [r.source.external_id, r]));
      for (const r of rows) {
        const ext = String(r.data.external_id ?? "");
        const prior = existing.get(ext);
        if (prior && !dup) {
          const same = JSON.stringify(prior.data) === JSON.stringify(r.data);
          errors.push({
            row: r.row_number,
            field: "external_id",
            message: same
              ? `external_id “${ext}” was already imported from ${prior.source.filename} (row ${prior.source.row_number}).`
              : `external_id “${ext}” conflicts with a different record already imported from ${prior.source.filename} (row ${prior.source.row_number}).`,
          });
        }
      }
      const imp = {
        id: `imp-${Date.now().toString(36)}`,
        kind,
        filename: file.name,
        status: errors.length ? ("invalid" as const) : ("previewed" as const),
        errors,
        row_count: rows.length,
        preview: rows.slice(0, 50).map((r) => r.data),
        created_at: new Date().toISOString(),
        committed_at: null,
        file_hash: hash,
        pending_rows: rows,
      };
      s.imports.unshift(imp);
      saveState();
      return delay(publicImport(imp), 250);
    },
    async commitImport(importId) {
      const s = loadState();
      const imp = s.imports.find((i) => i.id === importId);
      if (!imp) throw new ApiError("That import preview no longer exists. Upload the file again.", 404);
      if (imp.status === "committed") return delay(publicImport(imp));
      if (imp.status === "invalid") throw new ApiError("This file has errors and can't be imported.", 422, "validation");
      const ids = new Set(s.records.filter(r => r.kind === imp.kind).map(r => r.source.external_id));
      if ((imp.pending_rows ?? []).some(r => ids.has(String(r.data.external_id)))) throw new ApiError("Existing external IDs; entire import rejected. Refresh and upload a corrected file.", 409);
      for (const r of imp.pending_rows ?? []) {
        const id = `${imp.id}-r${r.row_number}`;
        s.records.push({ id, kind: imp.kind, data: r.data, source: { record_id: id, import_id: imp.id, filename: imp.filename, row_number: r.row_number, external_id: String(r.data.external_id), url: null } });
      }
      imp.status = "committed";
      imp.committed_at = new Date().toISOString();
      delete imp.pending_rows;
      saveState();
      return delay(publicImport(imp), 200);
    },
    listImports: () => delay(loadState().imports.map(publicImport)),
    async getImport(id) {
      const imp = loadState().imports.find((i) => i.id === id);
      if (!imp) throw new ApiError("Import not found.", 404);
      return delay(publicImport(imp));
    },
    listRecords: (kind, on, limit, offset) => delay(listRecords(loadState(), kind, on, limit, offset)),
    async getRecord(id) {
      const r = loadState().records.find((x) => x.id === id);
      if (!r) throw new ApiError("Record not found.", 404);
      return delay(r, 60);
    },
    briefing: (on) => delay(computeBriefing(loadState(), on)),
    inventory: (on) => delay(computeInventory(loadState(), on)),
    alerts: (on) => delay(computeAlerts(loadState(), on)),
    ask: (q, on) => delay(answerQuestion(loadState(), q, on), 300),
    integrations: () => delay(INTEGRATIONS),
  };
}

/* ---------------- Connected API mode ---------------- */

export function createLiveApi(baseUrl: string): SideWorkApi {
  const root = baseUrl.replace(/\/+$/, "");
  async function req<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${root}${path}`, init);
    } catch {
      throw new ApiError(`Couldn't reach the Side Work server at ${root}. Check that it is running, reachable over the network, and allows requests from this site (CORS).`, null, "network");
    }
    if (!res.ok) {
      let msg = `The server responded with ${res.status}.`;
      try {
        const body = await res.json();
        const d = body?.detail ?? body?.message;
        if (typeof d === "string") msg = d;
        else if (d && typeof d === "object" && !Array.isArray(d)) msg = [d.message, d.external_ids?.length ? `Conflicting IDs: ${d.external_ids.join(", ")}` : null].filter(Boolean).join(" ");
        else if (Array.isArray(d)) msg = d.map((x) => x?.msg ?? JSON.stringify(x)).join("; ");
      } catch {
        /* keep default */
      }
      if (res.status === 413) msg = "This file is larger than the server's upload limit (2 MB).";
      throw new ApiError(msg, res.status);
    }
    return res.json() as Promise<T>;
  }
  const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const asList = <T,>(v: unknown, key: string): T[] => (Array.isArray(v) ? (v as T[]) : (((v as Record<string, unknown>)?.[key] as T[]) ?? []));

  return {
    mode: "live",
    health: () => req("/health"),
    templates: async () => {
      const v = await req<{ formats: Record<RecordKind, string[]> }>("/api/imports/templates");
      return Object.entries(v.formats).map(([kind, headers]) => ({ kind: kind as RecordKind, headers, filename: `side-work-${kind}-template.csv` }));
    },
    previewImport(kind, file) {
      if (file.size > MAX_FILE_BYTES) return Promise.reject(new ApiError("This file is larger than 2 MB.", 413, "validation"));
      const fd = new FormData();
      fd.append("file", file);
      // No Content-Type header: the browser sets the multipart boundary.
      return req<WireImport>(`/api/imports/preview?kind=${kind}`, { method: "POST", body: fd }).then(normalizeImport);
    },
    commitImport: (id) => req<WireImport>(`/api/imports/${encodeURIComponent(id)}/commit`, { method: "POST" }).then(normalizeImport),
    listImports: async () => (await req<WireImport[]>("/api/imports")).map(normalizeImport),
    getImport: (id) => req<WireImport>(`/api/imports/${encodeURIComponent(id)}`).then(normalizeImport),
    listRecords: async (kind, on, limit, offset) => {
      const v = await req<{ total: number; records: WireRecord[] }>(`/api/records?kind=${kind}${on ? `&on=${on}` : ""}&limit=${limit}&offset=${offset}`);
      return { ...v, records: v.records.map(normalizeRecord) };
    },
    getRecord: (id) => req<WireRecord>(`/api/records/${encodeURIComponent(id)}`).then(normalizeRecord),
    briefing: (on) => req<WireBriefing>(`/api/briefing?on=${on}`).then(normalizeBriefing),
    async inventory(on) {
      return normalizeInventory(await req<WireInventory>(`/api/inventory?on=${on}`), on);
    },
    alerts: async (on) => asList<Parameters<typeof normalizeAlert>[0]>(await req(`/api/alerts?on=${on}`), "alerts").map(normalizeAlert),
    ask: async (question, on) => normalizeAnswer(await req("/api/ask", json({ question, on })), question, on),
    integrations: async () => {
      const v = await req<{ connections: { provider: string; status: "not_connected" }[] }>("/api/integrations");
      return [INTEGRATIONS[0]!, ...v.connections.map(c => ({ id: c.provider.toLowerCase(), name: c.provider, status: c.status, description: INTEGRATIONS.find(i => i.id === c.provider.toLowerCase())?.description ?? "Provider integration" }))];
    },
  };
}
