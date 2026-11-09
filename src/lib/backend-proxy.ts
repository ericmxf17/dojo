/** Same-origin production API gateway. Configuration and credentials stay server-side. */
export async function proxyBackend(request: Request, config: { url?: string; apiKey?: string }, send: typeof fetch = fetch): Promise<Response | null> {
  const incoming = new URL(request.url);
  if (!incoming.pathname.startsWith('/sidework-api/')) return null;
  const path = incoming.pathname.slice('/sidework-api'.length);
  if (path !== '/health' && !path.startsWith('/api/')) return Response.json({ detail: 'API route not found' }, { status: 404 });
  if (!['GET', 'POST'].includes(request.method)) return Response.json({ detail: 'Method not allowed' }, { status: 405 });
  if (!config.url) return Response.json({ detail: 'A hosted backend is not configured. Use the explicitly labeled Sample data mode for this demo.' }, { status: 503 });
  let backend: URL;
  try {
    backend = new URL(config.url);
    if (!['https:', 'http:'].includes(backend.protocol) || backend.username || backend.password) throw new Error('Invalid backend URL');
  } catch {
    return Response.json({ detail: 'Backend configuration is invalid' }, { status: 503 });
  }
  const headers = new Headers();
  for (const key of ['content-type', 'accept']) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (config.apiKey) headers.set('X-API-Key', config.apiKey);
  const target = `${backend.href.replace(/\/+$/, '')}${path}${incoming.search}`;
  const body = request.method === 'POST' ? await request.arrayBuffer() : undefined;
  if (body && body.byteLength > 2_100_000) return Response.json({ detail: 'Upload exceeds the 2 MB CSV limit' }, { status: 413 });
  try {
    const response = await send(target, { method: request.method, headers, ...(body ? { body } : {}), signal: AbortSignal.timeout(20000), redirect: 'error' });
    const safe = new Headers({ 'Cache-Control': 'no-store' });
    safe.set('Content-Type', response.headers.get('content-type') ?? 'application/json');
    return new Response(response.body, { status: response.status, headers: safe });
  } catch {
    return Response.json({ detail: 'The hosted Side Work backend is currently unreachable. No sample data has been substituted.' }, { status: 502 });
  }
}
