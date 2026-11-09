// @vitest-environment node
/** Real HTTP contract tests against an isolated, temporary SQLite backend. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';
import { createLiveApi, type SideWorkApi } from '@/lib/sidework/api';
import { validateCsv } from '@/lib/sidework/csv';
import type { RecordKind } from '@/lib/sidework/types';

let child: ChildProcess;
let api: SideWorkApi;
let url: string;
const scratch = mkdtempSync(path.join(tmpdir(), 'sidework-contract-'));
const kinds: RecordKind[] = ['sales', 'purchases', 'labor', 'inventory'];
const upload = (text: string, name = 'test.csv') => new File([text], name, { type: 'text/csv' });

beforeAll(async () => {
  const socket = createServer();
  await new Promise<void>(r => socket.listen(0, '127.0.0.1', r));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>(r => socket.close(() => r()));
  url = `http://127.0.0.1:${port}`;
  child = spawn(path.resolve('backend/.venv/bin/python'), ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: path.resolve('backend'), env: { ...process.env, SIDEWORK_DB: path.join(scratch, 'test.db'), SIDEWORK_API_KEY: '' }, stdio: 'pipe',
  });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('Integration-test backend failed to start');
    try { if ((await fetch(url + '/health')).ok) break; } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 50));
  }
  api = createLiveApi(url);
  expect((await api.health()).status).toBe('ok');
  for (const kind of kinds) {
    const p = await api.previewImport(kind, upload(readFileSync(`backend/sample_data/${kind}.csv`, 'utf8'), `${kind}.csv`));
    expect(p.status).toBe('previewed');
    expect(p.errors).toEqual([]);
    expect(p.preview[0]?.external_id).toBeTruthy();
    await api.commitImport(p.id);
  }
}, 20000);

afterAll(async () => {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise<void>(resolve => child.once('exit', () => resolve()));
  }
  rmSync(scratch, { recursive: true, force: true });
});

describe('Frontend service → real FastAPI → SQLite', () => {
  it('normalizes briefing alerts and inventory coverage without losing amounts', async () => {
    const b = await api.briefing('2026-11-09');
    expect(b.metrics.net_sales.amount_cents).toBe(102000);
    expect(b.metrics.estimated_wages.amount_cents).toBe(32000);
    expect(b.metrics.recorded_purchases.amount_cents).toBe(9600);
    expect(b.metrics.estimated_wage_to_sales_percent).toBe(31.37);
    expect(b.inventory_as_of).toBe('2026-11-09');
    expect(b.missing_data).toEqual([]);
    expect(b.alerts).toHaveLength(4);
    expect(new Set(b.alerts.map(a => a.id)).size).toBe(4);
    expect(b.alerts.every(a => a.title && ['high', 'medium', 'low'].includes(a.severity))).toBe(true);
  });
  it('provides all four downloadable templates with backend-compatible headers', async () => {
    const templates = await api.templates();
    expect(templates).toHaveLength(4);
    for (const t of templates) {
      const raw = readFileSync(`backend/sample_data/${t.kind}.csv`, 'utf8');
      expect(t.headers).toEqual(raw.split('\n')[0]!.split(','));
      expect(validateCsv(t.kind, raw).errors).toEqual([]);
    }
  });
  it('renders normalized pantry batches, thresholds, expiration, and source IDs', async () => {
    const inv = await api.inventory('2026-11-09');
    expect(inv.items).toHaveLength(3);
    const milk = inv.items.find(i => i.ingredient === 'Milk')!;
    expect(milk.quantity).toBe(4);
    expect(milk.statuses).toEqual(['low_stock', 'expiration_approaching']);
    expect(milk.expiration_dates).toEqual(['2026-11-11']);
    expect(milk.batches[0]!.record_id).toBe(milk.sources[0]!.record_id);
    const empty = await api.inventory('2026-11-01');
    expect(empty).toEqual({ as_of: null, items: [] });
  });
  it('normalizes records for date filtering, pagination and source drawers', async () => {
    const list = await api.listRecords('purchases', '2026-11-09', 1, 0);
    expect(list.total).toBe(2);
    expect(list.records).toHaveLength(1);
    const row = list.records[0]!;
    expect(row.id).toBe(row.source.record_id);
    expect(row.data.business_date).toBe('2026-11-09');
    expect(row.data.vendor).toBeTruthy();
    expect(row.data.total_cents).toBeTypeOf('number');
    expect(await api.getRecord(row.id)).toEqual(row);
    const second = await api.listRecords('purchases', '2026-11-09', 1, 1);
    expect(second.records[0]!.id).not.toBe(row.id);
  });
  it('retains question and date on supported and unsupported answers', async () => {
    for (const question of ['What were sales?', 'What were labor costs?', 'What were purchases?', 'What needs attention today?']) {
      const answer = await api.ask(question, '2026-11-09');
      expect(answer.supported).toBe(true);
      expect(answer.question).toBe(question);
      expect(answer.on).toBe('2026-11-09');
      expect(answer.sources.length).toBeGreaterThan(0);
    }
    const unsupported = await api.ask('Forecast sales next month', '2026-11-09');
    expect(unsupported.supported).toBe(false);
    expect(unsupported.supported_questions).toHaveLength(4);
  });
  it('preserves missing data instead of manufacturing zero totals', async () => {
    const b = await api.briefing('2026-11-01');
    expect(b.metrics.net_sales.amount_cents).toBeNull();
    expect(b.inventory_as_of).toBeNull();
    expect(b.missing_data).toHaveLength(4);
  });
  it('lists available CSV imports and honestly disconnected vendors', async () => {
    expect((await api.integrations()).map(i => [i.name, i.status])).toEqual([
      ['CSV imports', 'available'], ['Toast', 'not_connected'], ['Resy', 'not_connected'],
    ]);
  });
  it('imports only after confirmation and survives a repeated commit', async () => {
    const p = await api.previewImport('sales', upload('external_id,date,item,quantity,net_sales\nlive-extra,2026-11-10,Tea,2,8.50\n'));
    expect(p.status).toBe('previewed');
    expect(p.preview[0]?.net_sales_cents).toBe(850);
    expect((await api.briefing('2026-11-10')).metrics.net_sales.amount_cents).toBeNull();
    expect((await api.commitImport(p.id)).status).toBe('committed');
    expect((await api.commitImport(p.id)).status).toBe('committed');
    expect((await api.briefing('2026-11-10')).metrics.net_sales.amount_cents).toBe(850);
    expect((await api.getImport(p.id)).status).toBe('committed');
  });
  it('maps invalid CSV row errors and blocks partial imports', async () => {
    const p = await api.previewImport('sales', upload('external_id,date,item,quantity,net_sales\ninvalid-test,2026-11-12,Tea,1,8.00\nbad,2026-11-12,Tea,1,NaN\n'));
    expect(p.status).toBe('invalid');
    expect(p.errors[0]?.row).toBe(3);
    await expect(api.commitImport(p.id)).rejects.toMatchObject({ status: 422 });
    expect((await api.briefing('2026-11-12')).metrics.net_sales.amount_cents).toBeNull();
  });
  it('surfaces useful duplicate-ID conflict errors, without partial writes', async () => {
    const p = await api.previewImport('sales', upload('external_id,date,item,quantity,net_sales\nsale-001,2026-11-09,Latte,1,1.00\nshould-not-import,2026-11-12,Tea,1,2.00\n'));
    await expect(api.commitImport(p.id)).rejects.toThrow(/sale-001/);
    expect((await api.briefing('2026-11-12')).metrics.net_sales.amount_cents).toBeNull();
  });
  it('treats exact repeated files as already committed', async () => {
    const p = await api.previewImport('sales', upload(readFileSync('backend/sample_data/sales.csv', 'utf8')));
    expect(p.status).toBe('committed');
    expect(p.errors).toEqual([]);
    expect((await api.listImports()).filter(i => i.status === 'committed')).toHaveLength(5);
  });
  it('does not silently fall back to sample records on HTTP errors', async () => {
    await expect(api.getRecord('missing-record')).rejects.toMatchObject({ status: 404 });
    const broken = createLiveApi('http://127.0.0.1:1');
    await expect(broken.briefing('2026-11-09')).rejects.toMatchObject({ kind: 'network' });
  });
});
