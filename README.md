# Studio site

Freelance web studio portfolio. Astro + Tailwind v4, static output, deployed
to Cloudflare Pages from GitHub. Design decisions live in `DESIGN-BRIEF.md`
and `CLAUDE.md`; brand strings live in `src/config/site.ts`.

## Commands

| Command           | Action                                             |
| ----------------- | -------------------------------------------------- |
| `npm run dev`     | Dev server (static pages only, no functions)       |
| `npm run build`   | Build the site to `dist/`                          |
| `npm run preview` | Preview the built site (static pages only)         |

To run the site *with* the contact form function locally:

```sh
npm run build
npx wrangler pages dev dist
```

## Deployment (Cloudflare Pages)

The site is fully static (`astro build` → `dist/`); the contact form runs as
a Pages Function from `functions/`, which Cloudflare deploys automatically
alongside the static assets. No SSR adapter is needed.

Connect the GitHub repo in the Cloudflare dashboard (Workers & Pages →
Create → Pages) with these build settings:

| Setting                | Value           |
| ---------------------- | --------------- |
| Framework preset       | Astro           |
| Build command          | `npm run build` |
| Build output directory | `dist`          |
| Root directory         | `/` (default)   |

Node version: Cloudflare Pages reads `.nvmrc` (Node 22 — Astro 7 requires
≥ 22.12). No `NODE_VERSION` variable needed.

Then set the contact form variables (below) for Production — add
`RESEND_API_KEY` as a **secret**. Every push to `main` deploys; other
branches get preview deployments. A GitHub Actions check
(`.github/workflows/ci.yml`) runs `astro build` on every push so broken
builds are caught before they reach a deploy.

## Contact form

The form posts to `/api/contact`, a Cloudflare Pages Function
(`functions/api/contact.ts`) that validates the submission and relays it as
an email via [Resend](https://resend.com). Spam control is a honeypot field,
no CAPTCHA. With JavaScript the form submits via `fetch` and shows inline
states; without it the function redirects to `/contact/sent/` or
`/contact/error/`.

### Required environment variables

Set these in the Cloudflare Pages dashboard (Settings → Environment
variables) for production, and in a local `.dev.vars` file (gitignored) for
`wrangler pages dev`:

| Variable         | Purpose                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `RESEND_API_KEY` | Resend API key.                                                                            |
| `CONTACT_FROM`   | Sender, e.g. `Studio <contact@your-domain>`. The domain must be verified in Resend.        |
| `CONTACT_TO`     | Destination inbox for form submissions.                                                    |

Optional: `RESEND_API_URL` overrides the Resend endpoint (used for local
testing against a mock; defaults to `https://api.resend.com`).

Example `.dev.vars`:

```ini
RESEND_API_KEY=re_xxxxxxxx
CONTACT_FROM=Studio <contact@example.com>
CONTACT_TO=inbox@example.com
```
