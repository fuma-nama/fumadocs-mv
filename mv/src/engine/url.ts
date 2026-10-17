const base = import.meta.env.BASE_URL;
let map: Record<string, string> = {};

/** The web build ships converted files (WebP, WOFF2 subsets, AAC); it maps public paths to them. */
export function setAssetMap(m: Record<string, string>) {
  map = m;
}

/** URL to load a public asset from, given its rooted path ('/plates/…'). */
export function assetUrl(path: string): string {
  const p = map[path] ?? path;
  return p.startsWith('/') ? base + p.slice(1) : p;
}
