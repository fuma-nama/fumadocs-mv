'use client';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { RootProvider } from 'fumadocs-ui/provider/next';

/** the loader base of the current route, so search results stay inside the same theme/layout route */
function routeBase(pathname: string) {
  const m = pathname.match(/^\/themes\/[^/]+(\/x\/[^/]+)?/);
  if (m) return m[1] === '/x/home' ? m[0].slice(0, -'/x/home'.length) : m[0];
  return '/docs';
}

export function Provider({ children }: { children: ReactNode }) {
  const base = routeBase(usePathname());
  return <RootProvider search={{ options: { api: `/api/search?base=${encodeURIComponent(base)}` } }}>{children}</RootProvider>;
}
