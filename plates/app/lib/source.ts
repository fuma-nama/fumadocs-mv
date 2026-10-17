import { loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { defineDocs } from 'fumadocs-mdx/macro';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';

const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema,
  },
  meta: {
    schema: metaSchema,
  },
});

function create(baseUrl: string) {
  return loader({
    baseUrl,
    source: docs.toFumadocsSource(),
    plugins: [lucideIconsPlugin()],
  });
}

export type Source = ReturnType<typeof create>;

const sources = new Map<string, Source>();

/** one loader per route prefix, so every layout route gets correct active states */
export function getSource(baseUrl: string): Source {
  let source = sources.get(baseUrl);
  if (!source) {
    source = create(baseUrl);
    sources.set(baseUrl, source);
  }
  return source;
}

export const source = getSource('/docs');
