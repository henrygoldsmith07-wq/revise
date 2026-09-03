"use client";

// ---------------------------------------------------------------------------
// End-to-end encryption for synced student data.
//
// The offline-first store keeps plaintext on the device (that data never
// leaves the browser except through the sync outbox), so the breach surface
// that matters is Supabase: one JSONB `data` column per row holding stems,
// answers, feedback and review history. When E2EE is on, that column holds
// only { v, alg, iv, ct } — an opaque blob a database breach cannot read.
//
// Design, kept deliberately narrow:
//
//   * AES-GCM 256 via Web Crypto, a fresh 12-byte IV per row. GCM gives
//     confidentiality *and* tamper detection — a modified ciphertext throws
//     on decrypt instead of silently returning attacker-chosen data.
//   * The key is generated on-device (extractable only for backup export),
//     persisted in the local `meta` store, and never transmitted. Server
//     rows carry the key *fingerprint* only, so a second device can tell
//     whether it holds the right key before attempting a pull.
//   * Turnkey on/off: `enabled` is a settings flag; rows written while it is
//     off stay plaintext, rows written while it is on decrypt transparently
//     on pull. The payload format is self-describing (`v`, `alg`), so a
//     mixed table — some rows encrypted, some not — reads correctly either
//     way, and disabling later loses nothing.
//
// Honest scope: this protects the `data` column against a *storage* breach.
// The server still sees row metadata (user_id, updated_at) and the index
// columns (due, date) the sync design already lifts out of the payload.
// ---------------------------------------------------------------------------

const KEY_META_KEY = "revise.e2ee.key.v1";
const ALG = "AES-GCM";
const IV_LENGTH = 12;

export interface EncryptedPayload {
  /** Payload format version, for future algorithm rotation. */
  v: 1;
  alg: typeof ALG;
  /** Base64 12-byte initialisation vector — unique per row, never reused. */
  iv: string;
  /** Base64 ciphertext of the JSON-serialised payload. */
  ct: string;
  /** Fingerprint of the encrypting key so devices can detect key mismatch. */
  fp: string;
}

export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.v === 1 && v.alg === ALG && typeof v.iv === "string" && typeof v.ct === "string" && typeof v.fp === "string";
}

// --- base64 helpers (btoa/atob are available in every target environment) ---

function bufToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- key lifecycle -----------------------------------------------------------

function toJwk(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey("jwk", key) as Promise<JsonWebKey>;
}

/**
 * The device's E2EE key, generating it on first use. Stored as a JWK in the
 * local meta store — the same IndexedDB the app already trusts with its
 * sync credentials. Never leaves the device (the explicit "reveal key"
 * backup flow in Settings is the one exception, user-initiated).
 */
export async function getOrCreateEncryptionKey(): Promise<CryptoKey> {
  const existing = await readStoredJwk();
  if (existing) {
    return crypto.subtle.importKey("jwk", existing, { name: ALG }, true, ["encrypt", "decrypt"]);
  }
  const key = await crypto.subtle.generateKey({ name: ALG, length: 256 }, true, ["encrypt", "decrypt"]);
  const jwk = await toJwk(key);
  await writeStoredJwk(jwk);
  memoized = null;
  return key;
}

async function readStoredJwk(): Promise<JsonWebKey | null> {
  if (typeof indexedDB === "undefined") return null;
  const { readMeta } = await import("./db");
  const stored = await readMeta<JsonWebKey>(KEY_META_KEY);
  return stored ?? null;
}

async function writeStoredJwk(jwk: JsonWebKey): Promise<void> {
  const { writeMeta } = await import("./db");
  await writeMeta(KEY_META_KEY, jwk);
}

/** Backup export: the only way the key leaves the device, and only on demand. */
export async function exportEncryptionKey(): Promise<string> {
  const key = await getOrCreateEncryptionKey();
  return JSON.stringify(await toJwk(key), null, 0);
}

/**
 * Install a recovery key from another device (Settings paste-in). Validated
 * by actually importing it; a bad paste cannot corrupt the stored key.
 */
export async function importEncryptionKey(jwkJson: string): Promise<boolean> {
  try {
    const jwk = JSON.parse(jwkJson) as JsonWebKey;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: ALG }, true, ["encrypt", "decrypt"]);
    await writeStoredJwk(await toJwk(key));
    memoized = null;
    return true;
  } catch {
    return false;
  }
}

// One key per session: generation/persist happens once, every later call
// reuses the memoised CryptoKey instead of re-reading IndexedDB per row.
let memoized: Promise<CryptoKey> | null = null;

export function encryptionKey(): Promise<CryptoKey> {
  memoized ??= getOrCreateEncryptionKey();
  return memoized;
}

/** SHA-256 key fingerprint, hex — enough to detect a mismatch, useless to attack. */
export async function keyFingerprint(key?: CryptoKey): Promise<string> {
  const k = key ?? (await getOrCreateEncryptionKey());
  const raw = await crypto.subtle.exportKey("raw", k);
  const digest = await crypto.subtle.digest("SHA-256", raw);
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- payload crypto ----------------------------------------------------------

/** Encrypt any JSON-serialisable payload into an opaque blob. */
export async function encryptPayload(payload: unknown, key?: CryptoKey): Promise<EncryptedPayload> {
  const k = key ?? (await encryptionKey());
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ct = await crypto.subtle.encrypt({ name: ALG, iv }, k, plaintext);
  return {
    v: 1,
    alg: ALG,
    iv: bufToBase64(iv),
    ct: bufToBase64(ct),
    fp: await keyFingerprint(k),
  };
}

/** Decrypt a blob produced by encryptPayload. Corrupted rows throw. */
export async function decryptPayload<T = unknown>(blob: EncryptedPayload, key?: CryptoKey): Promise<T> {
  const k = key ?? (await encryptionKey());
  const plaintext = await crypto.subtle.decrypt(
    { name: ALG, iv: base64ToBuf(blob.iv) },
    k,
    base64ToBuf(blob.ct),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
