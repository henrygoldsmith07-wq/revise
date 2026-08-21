// pdf.js needs its worker served from our own origin (the CDN is blocked by the
// app's CSP, and an offline PWA cannot reach one anyway). The file is ~1.2 MB
// of generated build output, so it is copied in at build time rather than
// committed — see .gitignore.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const to = join(root, "public/pdf.worker.min.mjs");

mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
console.log("copied pdf.worker.min.mjs → public/");
