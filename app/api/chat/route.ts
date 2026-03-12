export const runtime = 'nodejs';

function backendBaseUrl(): string {
  return String(process.env.INTERNAL_API_BASE_URL || process.env.API_BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
}

async function proxyToBackend(path: string, req: Request): Promise<Response> {
  const url = `${backendBaseUrl()}${path}`;
  const body = await req.text();
  const response = await fetch(url, {
    method: req.method,
    headers: {
      'Content-Type': req.headers.get('content-type') || 'application/json'
    },
    body
  });

  const headers = new Headers();
  const contentType = response.headers.get('content-type') || 'application/json';
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', response.headers.get('cache-control') || 'no-cache, no-transform');

  return new Response(response.body, {
    status: response.status,
    headers
  });
}

export async function POST(req: Request) {
  return proxyToBackend('/api/chat', req);
}
