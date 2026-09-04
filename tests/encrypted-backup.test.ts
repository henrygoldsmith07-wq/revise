import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  decryptBackup,
  encryptBackup,
  generateRecoveryCode,
} from "@/data/encrypted-backup";

beforeAll(() => {
  vi.stubGlobal("crypto", webcrypto);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("encrypted recovery backups", () => {
  it("generates a printable recovery code and round-trips an envelope", async () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-Za-z0-9_-]+(?:-[A-Za-z0-9_-]+)+$/);
    expect(code.split("-").every((part) => part.length === 6)).toBe(true);

    const envelope = await encryptBackup({ version: 4, stores: { cards: [{ id: "safe" }] } }, code);
    expect(envelope.format).toBe("revise-encrypted-backup");
    expect(envelope.ciphertext).not.toContain("safe");
    await expect(decryptBackup(envelope, code)).resolves.toEqual({ version: 4, stores: { cards: [{ id: "safe" }] } });
  });

  it("does not silently accept a lost or incorrect encryption key", async () => {
    const code = generateRecoveryCode();
    const envelope = await encryptBackup({ private: "answer content" }, code);
    await expect(decryptBackup(envelope, `${code}-wrong`)).rejects.toMatchObject({
      code: "wrong-key",
    });
  });

  it("rejects damaged or unsupported envelopes before attempting recovery", async () => {
    await expect(decryptBackup({ format: "revise-encrypted-backup", version: 99 }, "long-enough-code")).rejects.toMatchObject({
      name: "BackupEncryptionError",
      code: "invalid-envelope",
    });
  });
});

