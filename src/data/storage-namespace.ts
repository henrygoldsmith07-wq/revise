import { deleteMeta, readMeta, writeMeta } from "./db";

/** Revise-owned metadata keys. These are shared-origin names, not private globals. */
export const REVISE_META_KEYS = {
  lastPullAt: "revise.lastPullAt.v1",
  onboardedAt: "revise.onboardedAt.v1",
  seedVersion: "revise.seedVersion.v1",
  revisionCheckpoint: "revise.revisionCheckpoint.v1",
} as const;

const LEGACY_KEYS = {
  lastPullAt: "lastPullAt",
  onboardedAt: "onboardedAt",
  seedVersion: "seedVersion",
  revisionCheckpoint: "revisionCheckpoint",
} as const;

/** Read a namespaced key and migrate its old unprefixed spelling once. */
export async function readReviseMeta<T>(name: keyof typeof REVISE_META_KEYS): Promise<T | undefined> {
  const currentKey = REVISE_META_KEYS[name];
  const current = await readMeta<T>(currentKey);
  if (current !== undefined) return current;

  const legacy = await readMeta<T>(LEGACY_KEYS[name]);
  if (legacy === undefined) return undefined;
  await writeMeta(currentKey, legacy);
  await deleteMeta(LEGACY_KEYS[name]);
  return legacy;
}

export async function writeReviseMeta(name: keyof typeof REVISE_META_KEYS, value: unknown): Promise<void> {
  await writeMeta(REVISE_META_KEYS[name], value);
}
