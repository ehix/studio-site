/**
 * Contact form handler — Cloudflare Pages Function.
 *
 * Accepts the fieldset form's POST, validates it, and relays the message
 * via Resend. Two response modes:
 *   - fetch submissions (Accept: application/json) get a JSON body the
 *     inline success/error states read;
 *   - plain form posts (no JS) get a 303 redirect to /contact/sent/ or
 *     /contact/error/.
 *
 * Required environment variables are documented in README.md.
 */
import { SITE } from '../../src/config/site';

interface Env {
  RESEND_API_KEY?: string;
  CONTACT_FROM?: string;
  CONTACT_TO?: string;
  /** Override for local testing against a mock; defaults to the real API. */
  RESEND_API_URL?: string;
}

const LIMITS = { name: 200, email: 254, message: 5000 } as const;

// Deliberately loose: real address validation happens when Resend tries to
// use it as a reply-to. This only rejects obvious non-addresses.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const wantsJson = (request: Request): boolean =>
  (request.headers.get('accept') ?? '').includes('application/json');

const respond = (request: Request, ok: boolean, status: number, error?: string): Response => {
  if (wantsJson(request)) {
    return Response.json(ok ? { ok } : { ok, error }, { status });
  }
  const target = new URL(ok ? '/contact/sent/' : '/contact/error/', request.url);
  return Response.redirect(target.toString(), 303);
};

export const onRequestPost = async (context: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  const { request, env } = context;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return respond(request, false, 400, 'Could not read the form.');
  }

  const field = (name: string): string => {
    const value = form.get(name);
    return typeof value === 'string' ? value.trim() : '';
  };

  // Honeypot: bots fill the hidden field. Report success, send nothing.
  if (field('website') !== '') {
    return respond(request, true, 200);
  }

  const name = field('name');
  const email = field('email');
  const message = field('message');

  if (name === '' || name.length > LIMITS.name) {
    return respond(request, false, 400, 'Please add your name.');
  }
  if (!EMAIL_SHAPE.test(email) || email.length > LIMITS.email) {
    return respond(request, false, 400, 'That email address does not look right.');
  }
  if (message === '' || message.length > LIMITS.message) {
    return respond(request, false, 400, 'Please add a message under 5000 characters.');
  }

  if (!env.RESEND_API_KEY || !env.CONTACT_FROM || !env.CONTACT_TO) {
    console.error('contact: missing RESEND_API_KEY, CONTACT_FROM or CONTACT_TO');
    return respond(request, false, 500, 'The form is not configured yet.');
  }

  try {
    const apiUrl = env.RESEND_API_URL ?? 'https://api.resend.com';
    const result = await fetch(`${apiUrl}/emails`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM,
        to: [env.CONTACT_TO],
        reply_to: email,
        subject: `${SITE.name} contact form: ${name}`,
        text: `From: ${name} <${email}>\n\n${message}\n`,
      }),
    });

    if (!result.ok) {
      console.error(`contact: Resend responded ${result.status}: ${await result.text()}`);
      return respond(request, false, 502, 'The message did not send. Please try again.');
    }
  } catch (cause) {
    console.error('contact: Resend request failed', cause);
    return respond(request, false, 502, 'The message did not send. Please try again.');
  }

  return respond(request, true, 200);
};
