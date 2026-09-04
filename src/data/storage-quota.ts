import { captureTelemetry } from "@/lib/observability";

export type StorageQuotaStatus = "ok" | "watch" | "critical" | "unavailable";

export interface StorageQuota {
  usageBytes: number | null;
  quotaBytes: number | null;
  percent: number | null;
  status: StorageQuotaStatus;
  checkedAt: string;
}

export const STORAGE_QUOTA_EVENT = "revise:storage-quota";

export function classifyStorageQuota(usageBytes: number | null, quotaBytes: number | null): StorageQuotaStatus {
  if (usageBytes == null || quotaBytes == null || quotaBytes <= 0) return "unavailable";
  const ratio = usageBytes / quotaBytes;
  if (ratio >= 0.9) return "critical";
  if (ratio >= 0.75) return "watch";
  return "ok";
}

export function makeStorageQuota(usageBytes: number | null, quotaBytes: number | null, checkedAt = new Date().toISOString()): StorageQuota {
  const status = classifyStorageQuota(usageBytes, quotaBytes);
  const percent = usageBytes != null && quotaBytes && quotaBytes > 0 ? Math.round((usageBytes / quotaBytes) * 1000) / 10 : null;
  return { usageBytes, quotaBytes, percent, status, checkedAt };
}

/** Read the browser estimate; unsupported browsers return an explicit state. */
export async function estimateStorageQuota(): Promise<StorageQuota> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return makeStorageQuota(null, null);
  try {
    const estimate = await navigator.storage.estimate();
    const result = makeStorageQuota(
      typeof estimate.usage === "number" ? estimate.usage : null,
      typeof estimate.quota === "number" ? estimate.quota : null,
    );
    if (result.status === "watch" || result.status === "critical") {
      captureTelemetry("storage.quota", {
        status: result.status === "critical" ? "critical" : "warning",
        usageBytes: result.usageBytes ?? undefined,
        quotaBytes: result.quotaBytes ?? undefined,
        percent: result.percent ?? undefined,
      });
    }
    return result;
  } catch {
    return makeStorageQuota(null, null);
  }
}

export function formatStorageBytes(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return "unknown";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

