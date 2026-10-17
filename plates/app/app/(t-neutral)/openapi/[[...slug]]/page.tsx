import { notFound, redirect } from 'next/navigation';
import { DocsBody, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { openapiSource } from '@/lib/openapi-source';
import { OpenAPIPage } from '@/components/api-page';

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const page = openapiSource.getPage(params.slug);
  if (!page) {
    const first = openapiSource.getPages()[0];
    if (!params.slug && first) redirect(first.url);
    notFound();
  }

  if (page.type === 'openapi') {
    return (
      <DocsPage toc={page.data.toc} full>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsBody>
          <OpenAPIPage {...page.data.getOpenAPIPageProps()} />
        </DocsBody>
      </DocsPage>
    );
  }
  notFound();
}
