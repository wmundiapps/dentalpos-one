import Script from 'next/script';
import { captchaSiteKey } from '@/lib/security';

/** Cloudflare Turnstile: só aparece quando TURNSTILE_SITE_KEY está configurada */
export function Captcha() {
  const key = captchaSiteKey();
  if (!key) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <div className="cf-turnstile field" data-sitekey={key} data-language="pt-br" data-theme="light" />
    </>
  );
}
