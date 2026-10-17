import type { ReactNode } from 'react';
import { BuildingIcon, CuboidIcon, PanelsTopLeftIcon, PencilIcon, TerminalIcon } from 'lucide-react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { DocsLayout as NotebookLayout } from 'fumadocs-ui/layouts/notebook';
import { DocsLayout as FluxLayout } from 'fumadocs-ui/layouts/flux';
import { DocsLayout as GlassLayout } from 'fumadocs-ui/layouts/glass';
import { DocsLayout as SpaciousLayout } from 'fumadocs-ui/layouts/spacious';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import type { LayoutTab } from 'fumadocs-ui/layouts/shared';
import { baseOptions, linkItems } from '@/lib/layout.shared';
import { getSource } from '@/lib/source';

export type LayoutKind = 'docs' | 'notebook' | 'notebook-top' | 'notebook-navbar' | 'flux' | 'glass' | 'spacious';

/**
 * explicit layout tabs (the page tree has no root folders): the real fumadocs.dev root folders
 * (apps/docs/content/docs/{(framework),ui,headless,mdx,cli}/meta.json), titles, descriptions, icons
 */
export function layoutTabs(base: string): LayoutTab[] {
  const source = getSource(base);
  const framework = new Set<string>();
  const ui = new Set<string>();
  for (const page of source.getPages()) {
    if (/^(getting-started|integrations)\//.test(page.path) || page.path === 'search.mdx') framework.add(page.url);
    if (/^(layouts|components)\//.test(page.path) || page.path === 'themes.mdx') ui.add(page.url);
  }
  return [
    { title: 'Framework', description: 'The docs framework', url: `${base}/getting-started/introduction`, icon: <BuildingIcon />, urls: framework },
    { title: 'Fumadocs UI', description: 'The default theme', url: `${base}/themes`, icon: <PanelsTopLeftIcon />, urls: ui },
    { title: 'Fumadocs Core', description: 'The headless library', url: `${base}/core/source-api`, icon: <CuboidIcon /> },
    { title: 'Fumadocs MDX', description: 'The official content source', url: `${base}/mdx/collections`, icon: <PencilIcon /> },
    { title: 'Fumadocs CLI', description: 'CLI tools for docs & automation', url: `${base}/cli/customize`, icon: <TerminalIcon /> },
  ];
}

export function LayoutFor({ kind, base, children }: { kind: LayoutKind; base: string; children: ReactNode }) {
  const tree = getSource(base).getPageTree();
  const options = baseOptions();
  switch (kind) {
    case 'docs':
      return (
        <DocsLayout tree={tree} {...options}>
          {children}
        </DocsLayout>
      );
    case 'notebook':
      return (
        <NotebookLayout tree={tree} {...options} tabs={layoutTabs(base)}>
          {children}
        </NotebookLayout>
      );
    case 'notebook-top':
      return (
        <NotebookLayout tree={tree} {...options} nav={{ ...options.nav, mode: 'top' }} tabMode="navbar" tabs={layoutTabs(base)}>
          {children}
        </NotebookLayout>
      );
    case 'notebook-navbar':
      return (
        <NotebookLayout tree={tree} {...options} tabMode="navbar" tabs={layoutTabs(base)}>
          {children}
        </NotebookLayout>
      );
    case 'flux':
      return (
        <FluxLayout tree={tree} {...options} tabs={layoutTabs(base)}>
          {children}
        </FluxLayout>
      );
    case 'glass':
      return (
        <GlassLayout tree={tree} {...options} tabs={layoutTabs(base)}>
          {children}
        </GlassLayout>
      );
    case 'spacious':
      return (
        <SpaciousLayout tree={tree} {...options} tabs={layoutTabs(base)}>
          {children}
        </SpaciousLayout>
      );
  }
}

export function HomeShell({ base, children }: { base: string; children: ReactNode }) {
  return (
    <HomeLayout {...baseOptions()} links={linkItems}>
      {children}
    </HomeLayout>
  );
}
