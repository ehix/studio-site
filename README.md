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
