import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { getVaultSource } from '@/lib/obsidian';

export default async function Layout({ children }: { children: ReactNode }) {
  const source = await getVaultSource();
  return (
    <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}
