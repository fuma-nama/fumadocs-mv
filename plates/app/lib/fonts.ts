import localFont from 'next/font/local';
import { Source_Serif_4 } from 'next/font/google';

// fumadocs.dev uses Geist + JetBrains Mono
export const geist = localFont({
  src: '../fonts/Geist-VF.ttf',
  variable: '--font-sans',
  weight: '100 900',
  display: 'block',
});

export const mono = localFont({
  src: '../fonts/JetBrainsMono-VF.ttf',
  variable: '--font-mono',
  weight: '100 800',
  display: 'block',
});

// customisation demo (?v=serif)
export const serif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'block',
});
