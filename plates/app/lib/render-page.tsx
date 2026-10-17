import type { ComponentProps, FC, ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { getMDXComponents } from '@/components/mdx';
import { getSource } from '@/lib/source';
import { gitConfig } from '@/lib/layout.shared';

/** the subset shared by every layout's `/page` module */
export interface PageModule {
  DocsPage: FC<any>;
  DocsTitle: FC<ComponentProps<'h1'>>;
  DocsDescription: FC<ComponentProps<'p'>>;
  DocsBody: FC<ComponentProps<'div'>>;
  MarkdownCopyButton: FC<any>;
  ViewOptionsPopover: FC<any>;
  PageLastUpdate?: FC<any>;
}

export interface RouteProps {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export interface RenderOptions {
  /** route prefix of the loader */
  baseUrl: string;
  /** theme preset name, substituted into `__PRESET__` placeholders */
  preset?: string;
  /** layout supports `tableOfContent.style` */
  tocStyles?: boolean;
  /** layout's DocsPage accepts `tableOfContentPopover` */
  tocPopover?: boolean;
  /** default TOC style when the query has none */
  defaultTocStyle?: 'normal' | 'clerk' | 'block';
  extra?: ReactNode;
}

function str(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export async function renderPage(Mod: PageModule, props: RouteProps, options: RenderOptions) {
  const [params, query] = await Promise.all([props.params, props.searchParams]);
  const source = getSource(options.baseUrl);
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const v = (str(query.v) ?? '').split(',');
  const tocStyle = (str(query.toc) ?? (v.includes('clerk') ? 'clerk' : options.defaultTocStyle)) as
    | 'normal'
    | 'clerk'
    | 'block'
    | undefined;
  const single = str(query.single) === '1';
  const markdownUrl = `${page.url}.mdx`;

  const tableOfContent: Record<string, unknown> = { single };
  const tableOfContentPopover: Record<string, unknown> = {};
  if (options.tocStyles !== false && tocStyle) {
    tableOfContent.style = tocStyle;
    tableOfContentPopover.style = tocStyle;
  }

  return (
    <Mod.DocsPage
      toc={page.data.toc}
      full={page.data.full}
      tableOfContent={tableOfContent}
      {...(options.tocPopover === false ? {} : { tableOfContentPopover })}
      breadcrumb={{ includePage: true }}
    >
      <Mod.DocsTitle>{page.data.title}</Mod.DocsTitle>
      <Mod.DocsDescription className="mb-0">{page.data.description}</Mod.DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b pb-6" data-plate="page-actions">
        <Mod.MarkdownCopyButton markdownUrl={markdownUrl} />
        <Mod.ViewOptionsPopover
          markdownUrl={markdownUrl}
          githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/apps/docs/content/docs/${page.path}`}
        />
      </div>
      <Mod.DocsBody>
        <MDX
          components={getMDXComponents(
            {
              a: createRelativeLink(source, page),
            },
            options.preset,
          )}
        />
      </Mod.DocsBody>
      {options.extra}
    </Mod.DocsPage>
  );
}

export function staticParams(baseUrl: string) {
  return getSource(baseUrl).generateParams();
}
