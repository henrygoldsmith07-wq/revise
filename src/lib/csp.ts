// Content Security Policy for app pages. src/proxy.ts mints a fresh nonce per
// request and Next.js stamps it on its own inline and bootstrap scripts, so
// script-src carries no 'unsafe-inline': an injected <script> or event handler
// cannot run, which matters because the E2EE key lives in this origin's
// IndexedDB. 'strict-dynamic' lets the nonced runtime load its chunks.
//
// Styles keep 'unsafe-inline': React style attributes and KaTeX output use
// them, and a nonce cannot cover attributes. Style injection cannot run code.

export function buildContentSecurityPolicy({ nonce, isDev }: { nonce: string; isDev: boolean }): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    "connect-src 'self' https: wss:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join("; ");
}

/** 128 random bits, base64: unguessable and unique per request. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
