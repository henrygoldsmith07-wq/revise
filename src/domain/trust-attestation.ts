/** Shared validation for human attestations that can unlock trusted evidence. */

const ISO_INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;

export const ATTESTATION_CLOCK_SKEW_MS = 5 * 60 * 1000;
export const WJEC_ATTESTATION_ROLES = ["examiner", "teacher", "subject-expert"] as const;

export function validAttestationInstant(value: unknown, nowMs = Date.now()): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  const match = ISO_INSTANT_PATTERN.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zoneText] = match;
  const zone = zoneText!;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return false;
  if (zone !== "Z") {
    const zoneHour = Number(zone.slice(1, 3));
    const zoneMinute = Number(zone.slice(4, 6));
    if (zoneHour > 23 || zoneMinute > 59) return false;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= nowMs + ATTESTATION_CLOCK_SKEW_MS;
}

/** Runtime trust requires the immutable source to be on WJEC's HTTPS origin. */
export function validOfficialWjecUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (url.hostname === "wjec.co.uk" || url.hostname.endsWith(".wjec.co.uk"));
  } catch {
    return false;
  }
}

export function validSha256Digest(value: unknown): value is string {
  return typeof value === "string" && /^(?:sha256:)?[a-f0-9]{64}$/i.test(value.trim());
}
