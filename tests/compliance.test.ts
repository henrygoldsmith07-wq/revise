import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import katex from "katex";
import {
  maskPii,
  maskStudentText,
  maskChatHistory,
  maskSummary,
  maskSummaryMany,
  hasMaskedContent,
} from "@/ai/pii";
import { decryptPayload, encryptPayload, isEncryptedPayload } from "@/data/e2ee";

const src = (p: string) => resolve(process.cwd(), p);

// ---------------------------------------------------------------------------
// Security, privacy and accessibility compliance (EdTech).
//
// E2EE: the Supabase outbox must never hold readable student data when the
// flag is on — payloads are AES-GCM blobs. Pure round-trips are unit-tested
// here (Web Crypto is available in node); the IndexedDB-backed key lifecycle
// follows the repo's structural-contract pattern.
//
// PII masking: student free text reaching an AI endpoint must be scrubbed
// locally first. The scrubber is pure, so its behaviour is fully tested.
//
// WCAG 2.1 AA: maths must carry a MathML twin for screen readers, and the
// Wilson/uncertainty and grade-history cues must not rely on colour alone.
// ---------------------------------------------------------------------------

describe("PII masking", () => {
  it("masks emails, phones and postcodes before they leave the device", () => {
    const { masked, entities } = maskPii(
      "Contact priya@example.com or 07700 900123, home postcode SW1A 1AA.",
    );
    expect(masked).not.toContain("priya@example.com");
    expect(masked).not.toContain("07700 900123");
    expect(masked).not.toContain("SW1A 1AA");
    expect(masked).toContain("[ENTITY_");
    expect(entities.map((e) => e.kind)).toEqual(
      expect.arrayContaining(["email", "phone", "postcode"]),
    );
  });

  it("masks person-name introductions and titles", () => {
    const { masked, entities } = maskPii(
      "My name is Priya Sharma and my teacher Mr Patel helped me.",
    );
    expect(masked).not.toContain("Priya Sharma");
    expect(masked).not.toContain("Mr Patel");
    expect(masked).toContain("[ENTITY_");
    expect(entities.some((e) => e.kind === "name")).toBe(true);
  });

  it("masks addresses and school names", () => {
    const { masked, entities } = maskPii("I go to Grange High School, 12 Maple Road.");
    expect(masked).not.toContain("Grange High School");
    expect(masked).not.toContain("12 Maple Road");
    expect(entities.map((e) => e.kind)).toEqual(
      expect.arrayContaining(["school", "address"]),
    );
  });

  it("keeps placeholders stable within one request so coreference survives", () => {
    const { masked } = maskPii("My name is Priya. Priya said the answer was correct.");
    expect(masked).toContain("[ENTITY_1]");
    // Both occurrences map to the same placeholder.
    const count = masked.split("[ENTITY_1]").length - 1;
    expect(count).toBe(2);
    expect(masked).not.toContain("Priya");
  });

  it("never masks mark-scheme keywords or subject terminology", () => {
    const { masked } = maskPii("Photosynthesis occurs in the Mitochondria of the cell.");
    expect(masked).toBe("Photosynthesis occurs in the Mitochondria of the cell.");
  });

  it("exposes what was withheld for the local disclosure", () => {
    const r = maskPii("Email priya@example.com, school Grange High School.");
    expect(hasMaskedContent(r)).toBe(true);
    expect(maskSummary(r)).toContain("email");
    expect(maskSummary(r)).toContain("school");
    expect(maskSummary(maskPii("plain text, no entities"))).toBeNull();
    expect(maskSummaryMany([maskPii("a@b.co"), maskPii("Mr Patel said x"), maskPii("clean")])).toMatch(
      /email|name/,
    );
    expect(maskSummaryMany([maskPii("clean text")])).toBeNull();
  });

  it("maskStudentText and maskChatHistory scrub only user-authored text", () => {
    expect(maskStudentText("Ring 07700 900123")).not.toContain("07700 900123");
    const history = maskChatHistory([
      { role: "user", content: "My name is Anna, call 07700 900123" },
      { role: "assistant", content: "Anna, the answer is 42" },
    ]);
    expect(history[0].content).not.toContain("Anna");
    expect(history[1].content).toBe("Anna, the answer is 42");
  });
});

describe("client wiring: masking precedes every outbound AI call", () => {
  it("aiMark masks per-part answers and reports withheld only for the cloud tier", () => {
    const client = readFileSync(src("src/ai/client.ts"), "utf8");
    expect(client).toContain("maskPii(value)");
    expect(client).toContain("maskedAnswers");
    expect(client).toContain("withheld");
    expect(client).toContain('tier === "ai"');
    // The rubric fallback must keep seeing the original text, never the mask.
    expect(client).toContain("markFallback(q, a)");
  });

  it("QuestionRunner surfaces the disclosure next to the mark", () => {
    const runner = readFileSync(src("src/components/QuestionRunner.tsx"), "utf8");
    expect(runner).toContain("withheld before sending");
    expect(runner).toContain("result.withheld");
  });
});

describe("E2EE for the sync outbox", () => {
  it("encrypt → decrypt round-trips arbitrary payloads", async () => {
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    const payload = { cardId: "c1", due: "2026-09-10", history: [1, 2, 3], note: "private" };
    const blob = await encryptPayload(payload, key);
    expect(blob.v).toBe(1);
    expect(blob.alg).toBe("AES-GCM");
    expect(isEncryptedPayload(blob)).toBe(true);
    expect(blob.ct).not.toContain("private");
    expect(await decryptPayload<typeof payload>(blob, key)).toEqual(payload);
  });

  it("a unique IV per row means identical payloads encrypt differently", async () => {
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    const payload = { answer: "same" };
    const a = await encryptPayload(payload, key);
    const b = await encryptPayload(payload, key);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it("tampering with the ciphertext throws instead of returning attacker data", async () => {
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    const blob = await encryptPayload({ answer: "my essay" }, key);
    const flipped = (blob.ct[0] === "A" ? "B" : "A") + blob.ct.slice(1);
    await expect(decryptPayload({ ...blob, ct: flipped }, key)).rejects.toThrow();
  });

  it("a wrong key fails decryption", async () => {
    const [keyA, keyB] = await Promise.all([
      crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]),
      crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]),
    ]);
    const blob = await encryptPayload({ x: 1 }, keyA);
    await expect(decryptPayload(blob, keyB)).rejects.toThrow();
  });

  it("shape guard rejects plaintext rows and partial blobs", () => {
    expect(isEncryptedPayload({ answers: "plaintext" })).toBe(false);
    expect(isEncryptedPayload(null)).toBe(false);
    expect(isEncryptedPayload({ v: 1, alg: "AES-GCM", iv: "x", ct: "y" })).toBe(false); // no fp
  });
});

describe("sync layer: encryption is on the write path", () => {
  it("sync.ts encrypts rows when E2EE is enabled for the user and skips on read failure", () => {
    const sync = readFileSync(src("src/data/sync.ts"), "utf8");
    expect(sync).toContain("encryptPayload");
    expect(sync).toContain("decryptPayload");
    expect(sync).toContain("isEncryptedPayload");
    expect(sync).toContain("e2eeEnabled");
  });

  it("settings exposes enable, reveal-key and import-key flows", () => {
    const settings = readFileSync(src("src/app/settings/page.tsx"), "utf8");
    expect(settings).toContain("e2eeEnabled");
    expect(settings).toContain("exportEncryptionKey");
    expect(settings).toContain("importEncryptionKey");
  });
});

describe("WCAG 2.1 AA: maths and non-colour cues", () => {
  it("KaTeX emits a MathML twin with the TeX source annotated", () => {
    const html = katex.renderToString("E = mc^2", {
      displayMode: false,
      throwOnError: false,
      output: "htmlAndMathml",
    });
    expect(html).toContain("<math");
    expect(html).toContain("application/x-tex");
    // The visual HTML half is hidden so SRs read exactly one representation.
    expect(html).toContain('aria-hidden="true"');
  });

  it("RichText renders maths with the MathML output mode", () => {
    const rich = readFileSync(src("src/components/RichText.tsx"), "utf8");
    expect(rich).toContain('output: "htmlAndMathml"');
    expect(rich).not.toContain('output: "html"');
  });

  it("Wilson-bound pills carry iconography and screen-reader text, not colour alone", () => {
    const panel = readFileSync(src("src/components/AssessmentPanels.tsx"), "utf8");
    expect(panel).toContain("UncertaintyGlyph");
    expect(panel).toContain('aria-hidden="true"'); // the glyph is decorative
    expect(panel).toContain('<span className="sr-only">{level} uncertainty. </span>');
    expect(panel).toContain("title={`${level} uncertainty`}");
  });

  it("grade-history swatches expose per-bar labels and a visible legend", () => {
    const stats = readFileSync(src("src/components/CardStatsPanel.tsx"), "utf8");
    expect(stats).toContain('role="img"');
    expect(stats).toContain("aria-label={`${GRADE_LABEL");
    expect(stats).toContain("GRADE_LEGEND");
    expect(stats).toContain("inline-flex items-center gap-1"); // swatch + text legend
  });
});
