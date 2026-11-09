/** Device-only answers; share the account key with the profile erase paths. */
export function practiceDraftStorageKey(userId: string): string {
  return `revise:practice-drafts:${userId}`;
}

export function clearPracticeDrafts(userId: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(practiceDraftStorageKey(userId));
  }
}
