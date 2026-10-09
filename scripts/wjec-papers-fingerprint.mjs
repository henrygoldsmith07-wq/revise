#!/usr/bin/env node
// Fingerprint an official WJEC paper file for the manifest.
//
// Prints the SHA-256 of the file bytes plus a manifest entry skeleton.
// Verifies nothing by itself: download the file from the official WJEC URL
// yourself, confirm the bytes are the official paper, then commit the entry
// to src/content/official-papers/manifest.json. Never commit the paper file
// or its question text — URLs + digests only.
//
// Usage:
//   npm run wjec:papers:fingerprint -- <file> --id=<manifest-id> --subject=<subject-id> --title="<title>" --url=<official-wjec-url>
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : undefined;
}

const file = process.argv[2];
if (!file || file.startsWith("--")) {
  console.error("Usage: npm run wjec:papers:fingerprint -- <file> --id=<manifest-id> --subject=<subject-id> --title=\"<title>\" --url=<official-wjec-url>");
  process.exit(1);
}

const bytes = await readFile(file);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const id = arg("--id") ?? "<manifest-id>";
const subjectId = arg("--subject") ?? "<subject-id>";
const title = arg("--title") ?? "<title>";
const url = arg("--url") ?? "<official-wjec-url>";

if (!/^https:\/\/([a-z0-9-]+\.)*wjec\.co\.uk(\/.*)?$/i.test(url)) {
  console.error("Refusing: --url must be an official WJEC HTTPS URL. Verify the file came from WJEC before fingerprinting it.");
  process.exit(1);
}

console.log(JSON.stringify({ id, board: "wjec", subjectId, title, sourceUrl: url, sha256 }, null, 2));
console.log(`\n${bytes.length} bytes fingerprinted. This proves nothing about provenance — only that these bytes hash to this digest.`);
