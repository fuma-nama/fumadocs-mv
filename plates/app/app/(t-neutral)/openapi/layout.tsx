import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { openapiSource } from '@/lib/openapi-source';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout tree={openapiSource.getPageTree()} {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}
