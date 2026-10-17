import { notFound } from 'next/navigation';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import defaultMdxComponents, { createRelativeLink } from 'fumadocs-ui/mdx';
import * as ObsidianComponents from 'fumadocs-obsidian/ui';
import { getVaultSource } from '@/lib/obsidian';

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const source = await getVaultSource();
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const { body, toc } = await (
    await page.data.load()
  ).render({
    ...defaultMdxComponents,
    ...ObsidianComponents,
    a: createRelativeLink(source, page),
  });

  return (
    <DocsPage toc={toc} full={page.data.frontmatter.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>{body}</DocsBody>
    </DocsPage>
  );
}
