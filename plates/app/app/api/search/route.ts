import { getSource } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';
import type { NextRequest } from 'next/server';

type Handler = ReturnType<typeof createFromSource>;
const handlers = new Map<string, Handler>();

function handler(base: string): Handler {
  let h = handlers.get(base);
  if (!h) {
    h = createFromSource(getSource(base));
    handlers.set(base, h);
  }
  return h;
}

export function GET(request: NextRequest) {
  const base = request.nextUrl.searchParams.get('base') ?? '/docs';
  if (!/^\/(docs|themes\/[\w-]+(\/x\/[\w-]+)?)$/.test(base)) return new Response('bad base', { status: 400 });
  return handler(base).GET(request);
}
