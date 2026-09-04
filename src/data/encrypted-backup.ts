/**
 * Password/recovery-code protected exports. The key is derived only in memory
 * and is never stored in IndexedDB, telemetry, or the Supabase replica.
 */

export const ENCRYPTED_BACKUP_VERSION = 1 as const;
const PBKDF2_ITERATIONS = 210_000;

export interface EncryptedBackupEnvelope {
  format: "revise-encrypted-backup";
  version: typeof ENCRYPTED_BACKUP_VERSION;
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  cipher: "AES-256-GCM";
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
}

export class BackupEncryptionError extends Error {
  readonly code: "unsupported" | "invalid-envelope" | "wrong-key";

  constructor(code: BackupEncryptionError["code"], message: string) {
    super(message);
    this.name = "BackupEncryptionError";
    this.code = code;
  }
}

/** Generate a printable recovery code. The caller must show/store it. */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(18);
  // Hex avoids the delimiter appearing inside a base64url alphabet, so the
  // displayed groups are unambiguous when a student reads them aloud or types
  // them from a paper backup.
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return hex.match(/.{1,6}/g)?.join("-") ?? hex;
}

export async function encryptBackup(value: unknown, recoveryCode: string): Promise<EncryptedBackupEnvelope> {
  const subtle = getSubtle();
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(subtle, recoveryCode, salt, "encrypt");
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(plaintext));
  return {
    format: "revise-encrypted-backup",
    version: ENCRYPTED_BACKUP_VERSION,
    kdf: "PBKDF2-SHA-256",
    iterations: PBKDF2_ITERATIONS,
    cipher: "AES-256-GCM",
    salt: base64UrlEncode(salt),
    iv: base64UrlEncode(iv),
    ciphertext: base64UrlEncode(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
  };
}

export async function decryptBackup<T = unknown>(envelope: unknown, recoveryCode: string): Promise<T> {
  const parsed = parseEnvelope(envelope);
  const subtle = getSubtle();
  const salt = base64UrlDecode(parsed.salt);
  const iv = base64UrlDecode(parsed.iv);
  const ciphertext = base64UrlDecode(parsed.ciphertext);
  const key = await deriveKey(subtle, recoveryCode, salt, "decrypt");
  try {
    const plaintext = await subtle.decrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(ciphertext));
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    throw new BackupEncryptionError("wrong-key", "That recovery code cannot decrypt this backup.");
  }
}

function parseEnvelope(value: unknown): EncryptedBackupEnvelope {
  if (!value || typeof value !== "object") {
    throw new BackupEncryptionError("invalid-envelope", "This is not a Revise encrypted backup.");
  }
  const row = value as Record<string, unknown>;
  const valid =
    row.format === "revise-encrypted-backup" &&
    row.version === ENCRYPTED_BACKUP_VERSION &&
    row.kdf === "PBKDF2-SHA-256" &&
    row.cipher === "AES-256-GCM" &&
    row.iterations === PBKDF2_ITERATIONS &&
    typeof row.salt === "string" &&
    typeof row.iv === "string" &&
    typeof row.ciphertext === "string" &&
    typeof row.createdAt === "string";
  if (!valid) throw new BackupEncryptionError("invalid-envelope", "This backup format is incomplete or unsupported.");
  try {
    const salt = base64UrlDecode(row.salt as string);
    const iv = base64UrlDecode(row.iv as string);
    const ciphertext = base64UrlDecode(row.ciphertext as string);
    if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17) throw new Error("invalid lengths");
  } catch {
    throw new BackupEncryptionError("invalid-envelope", "This backup payload is damaged.");
  }
  return row as unknown as EncryptedBackupEnvelope;
}

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new BackupEncryptionError("unsupported", "This browser cannot encrypt backups.");
  return subtle;
}

async function deriveKey(
  subtle: SubtleCrypto,
  recoveryCode: string,
  salt: Uint8Array,
  usage: KeyUsage,
): Promise<CryptoKey> {
  if (recoveryCode.trim().length < 8) throw new BackupEncryptionError("wrong-key", "Use a longer recovery code.");
  const material = await subtle.importKey("raw", toArrayBuffer(new TextEncoder().encode(recoveryCode)), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", salt: toArrayBuffer(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (!globalThis.crypto?.getRandomValues) {
    throw new BackupEncryptionError("unsupported", "This browser cannot generate a secure recovery code.");
  }
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid base64url");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Copy into a standalone ArrayBuffer for TypeScript's strict WebCrypto types. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

