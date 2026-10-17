import { loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { openapi } from './openapi';

export const openapiSource = loader(
  {
    openapi: await openapi.staticSource({
      groupBy: 'tag',
    }),
  },
  {
    baseUrl: '/openapi',
    plugins: [lucideIconsPlugin(), openapi.loaderPlugin()],
  },
);
