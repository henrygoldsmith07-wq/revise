// Zod v4 probes `new Function("")` to detect eval support, which the nonce CSP
// reports (script-src violation) on every page load. jitless skips the probe.
// Import `z` from here, never from "zod", so the config runs before schemas are built.
import { z } from "zod";

z.config({ jitless: true });

export { z };
