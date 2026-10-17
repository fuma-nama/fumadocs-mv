// node capture/run.mjs <task> [...]   (dev or prod server must run on PLATES_URL, default :5310)
import { launch, log, buildManifest } from './lib.mjs';
import * as read from './jobs/read.mjs';
import * as toc from './jobs/toc.mjs';
import * as layouts from './jobs/layouts.mjs';
import * as themes from './jobs/themes.mjs';
import * as cli from './jobs/cli.mjs';
import * as integrations from './jobs/integrations.mjs';
import * as inter from './jobs/interactions.mjs';

const tasks = {
  'read:p0': async (b) => {
    await read.readFrame(b, { theme: 'orange', mode: 'light' });
    await read.readFrame(b, { theme: 'neutral', mode: 'light' });
    await read.readFrame(b, { theme: 'neutral', mode: 'dark' });
  },
  'read:frame': async (b) => read.readFrame(b, { theme: 'orange', mode: 'light' }),
  'read:tall': async (b) => {
    await read.readTall(b, { theme: 'orange', mode: 'light' });
    await read.readTall(b, { theme: 'orange', mode: 'light', dpr: 1 });
  },
  'read:search': async (b) => read.readSearch(b, { theme: 'orange', mode: 'light', query: 'contents', downs: 1 }),
  'read:search-layouts': async (b) => read.readSearch(b, { theme: 'orange', mode: 'light', query: 'layouts', downs: 1 }),
  'toc:variants': async (b) => {
    await toc.tocVariants(b, { theme: 'orange', mode: 'light' });
    await toc.tocVariants(b, { theme: 'orange', mode: 'dark' });
  },
  'toc:glass': async (b) => {
    await toc.tocGlass(b, { mode: 'dark' });
    await toc.tocGlass(b, { mode: 'light' });
  },
  'toc:mobile': async (b) => toc.tocMobile(b, { mode: 'dark' }),
  'toc:spacious': async (b) => toc.tocSpacious(b, { mode: 'dark' }),
  'layouts:dark': async (b) => {
    for (const kind of layouts.KINDS) await layouts.captureLayout(b, { kind, mode: 'dark' });
  },
  'layouts:light': async (b) => {
    for (const kind of layouts.KINDS) await layouts.captureLayout(b, { kind, mode: 'light', layers: false });
  },
  themes: async (b) => {
    for (const preset of themes.PRESETS) for (const mode of ['light', 'dark']) await themes.captureTheme(b, { preset, mode });
  },
  'themes:s600': async (b) => {
    for (const preset of themes.PRESETS) for (const mode of ['light', 'dark']) await themes.captureTheme(b, { preset, mode, scrollY: 600 });
  },
  'cli:layouts': async (b) => cli.cliLayouts(b),
  'cli:variants': async (b) => cli.cliVariants(b),
  'cli:files': async (b) => cli.cliFiles(b),
  'int:openapi': async (b) => {
    await integrations.openapiOperation(b);
    await integrations.openapiPlayground(b);
    await integrations.openapiLabels(b);
  },
  'int:story': async (b) => integrations.storyCards(b),
  'int:obsidian': async (b) => integrations.obsidianPages(b),
  'int:sanity': async (b) => integrations.sanityBlocks(b),
  'read:extras': async (b) => inter.readExtras(b),
  'read:toc-states': async (b) => inter.readTocStates(b),
  interactions: async (b) => inter.interactions(b),
  'toc:seq': async (b) => inter.tocSequences(b),
  manifest: async () => buildManifest(),
};

const names = process.argv.slice(2);
const browser = await launch();
try {
  for (const n of names) {
    if (!tasks[n]) throw new Error(`unknown task ${n}; known: ${Object.keys(tasks).join(', ')}`);
    const t0 = Date.now();
    await tasks[n](browser);
    log(`${n} done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
} finally {
  await browser.close();
}
