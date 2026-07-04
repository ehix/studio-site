/**
 * Single source of truth for brand strings. Swap the placeholder values here
 * and every component, meta tag, and the Astro site URL follow.
 * (Exception: the npm package name in package.json — update that by hand.)
 */
export const SITE = {
  /** Full studio name — hero h1, page titles, copyright line. */
  name: 'Studio Name',
  /** Short wordmark — header/nav and terminal-flavoured section labels. */
  shortName: 'Studio',
  /** What the studio is, appended to the homepage title. */
  role: 'web studio',
  /** One-line positioning statement — hero paragraph. */
  tagline: 'One-line positioning statement goes here: plain English, deliberate, no jargon.',
  /** Meta description for the homepage. */
  description: 'A freelance web studio building fast, accessible sites for local organisations.',
  /** Canonical origin, no trailing slash — feeds astro.config `site` and OG tags. */
  url: 'https://example.com',
  /** Social handles — not rendered anywhere yet; wire in when links are designed. */
  handles: {
    github: 'your-github',
    linkedin: 'your-linkedin',
  },
} as const;
