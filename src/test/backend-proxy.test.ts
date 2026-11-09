// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { proxyBackend } from '@/lib/backend-proxy';

const req = (path: string, init?: RequestInit) => new Request(`https://sidework.example${path}`, init);
describe('Vercel backend gateway', () => {
  it('leaves website requests to TanStack', async () => expect(await proxyBackend(req('/imports'), {})).toBeNull());
  it('explicitly reports missing hosted backend', async () => {
    const r = await proxyBackend(req('/sidework-api/health'), {});
    expect(r?.status).toBe(503);
    expect(await r?.text()).toContain('Sample data');
  });
  it('forwards dates and only the server-side credential', async () => {
    const send = vi.fn().mockResolvedValue(Response.json({ status: 'ok' }));
    const r = await proxyBackend(req('/sidework-api/api/briefing?on=2026-11-09', { headers: { 'X-API-Key': 'untrusted', cookie: 'private-browser-cookie' } }), { url: 'https://backend.example/', apiKey: 'server-key' }, send);
    expect(r?.status).toBe(200);
    expect(send.mock.calls[0]?.[0]).toBe('https://backend.example/api/briefing?on=2026-11-09');
    const h = send.mock.calls[0]?.[1].headers as Headers;
    expect(h.get('X-API-Key')).toBe('server-key');
    expect(h.has('cookie')).toBe(false);
    expect(r?.headers.get('cache-control')).toBe('no-store');
  });
  it('preserves upload bytes and multipart boundary', async () => {
    const send = vi.fn().mockResolvedValue(Response.json({ id: 'import-1' }, { status: 201 }));
    const r = await proxyBackend(req('/sidework-api/api/imports/preview?kind=sales', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=test' }, body: '--test\r\nfixture' }), { url: 'https://backend.example' }, send);
    expect(r?.status).toBe(201);
    expect(send.mock.calls[0]?.[1].headers.get('content-type')).toContain('boundary=test');
    expect(new TextDecoder().decode(send.mock.calls[0]?.[1].body)).toBe('--test\r\nfixture');
  });
  it('preserves backend validation failures', async () => {
    const r = await proxyBackend(req('/sidework-api/api/records'), { url: 'https://backend.example' }, vi.fn().mockResolvedValue(Response.json({ detail: 'Conflict' }, { status: 409 })));
    expect(r?.status).toBe(409);
  });
  it('reports network failure without leaking the target or secrets', async () => {
    const r = await proxyBackend(req('/sidework-api/health'), { url: 'https://backend.example', apiKey: 'server-key' }, vi.fn().mockRejectedValue(new Error('private info')));
    expect(r?.status).toBe(502);
    expect(await r?.text()).not.toContain('private info');
  });
  it('rejects invalid configuration', async () => expect((await proxyBackend(req('/sidework-api/health'), { url: 'file:///etc/passwd' }))?.status).toBe(503));
  it('restricts proxy routes and methods', async () => {
    expect((await proxyBackend(req('/sidework-api/admin'), {}))?.status).toBe(404);
    expect((await proxyBackend(req('/sidework-api/health', { method: 'DELETE' }), {}))?.status).toBe(405);
  });
});
