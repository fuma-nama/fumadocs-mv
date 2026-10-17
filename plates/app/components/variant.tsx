'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { Banner } from 'fumadocs-ui/components/banner';

/**
 * Capture variants (customisation demos), from `?v=a,b,c`:
 * sidebar (restyled sidebar), banner (Banner on top), serif / mono (fonts), clerk (TOC style, handled by the page)
 */
export function Variant() {
  const params = useSearchParams();
  const v = (params.get('v') ?? '').split(',').filter(Boolean);
  const key = v.join(' ');

  useEffect(() => {
    if (key) document.documentElement.dataset.v = key;
    else delete document.documentElement.dataset.v;
  }, [key]);

  if (!v.includes('banner')) return null;
  return (
    <Banner variant="rainbow" data-plate="banner">
      Hello World
    </Banner>
  );
}
