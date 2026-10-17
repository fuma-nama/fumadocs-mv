import Link from 'next/link';
import Image from 'next/image';
import banner from '@/public/banner.png';

/**
 * A landing page in the spirit of fumadocs.dev, built with Fumadocs UI classes. The copy is the
 * real fumadocs.dev hero (apps/docs/app/(home)/page.tsx): badge, title with "style" in the brand
 * colour (apps/docs/app/global.css --color-brand), Getting Started + Open StackBlitz.
 */
export function HomeHero({ docsUrl }: { docsUrl: string }) {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-16 text-center md:py-24" data-plate="hero">
      <p className="mb-4 rounded-full border border-[hsl(26,73%,51%)]/50 p-2 text-xs font-medium text-[hsl(26,73%,51%)] dark:border-[#fff383]/50 dark:text-[#fff383]" data-plate="hero-badge">
        the React.js docs framework you love.
      </p>
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl" data-plate="hero-title">
        Build excellent
        <br className="md:hidden" /> documentation,
        <br />
        your <span className="text-[hsl(26,73%,51%)] dark:text-[#fff383]">style</span>.
      </h1>
      <div className="mt-8 flex flex-row items-center gap-3" data-plate="hero-actions">
        <Link href={docsUrl} className="inline-flex items-center rounded-full bg-fd-primary px-5 py-3 font-medium text-fd-primary-foreground" data-plate="hero-cta-primary">
          Getting Started
        </Link>
        <a
          href="https://stackblitz.com/github/fuma-nama/fumadocs/tree/main/examples/stackblitz"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center rounded-full border bg-fd-secondary px-5 py-3 font-medium text-fd-secondary-foreground"
          data-plate="hero-cta-secondary"
        >
          Open StackBlitz
        </a>
      </div>
      <div className="mt-14 w-full max-w-5xl overflow-hidden rounded-2xl border bg-fd-card p-2 shadow-xl" data-plate="hero-image">
        <Image src={banner} alt="Fumadocs" className="rounded-xl" priority />
      </div>
    </main>
  );
}
