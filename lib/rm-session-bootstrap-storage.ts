export const RM_BOOTSTRAP_STORAGE_PREFIX = "olready_rm_bootstrap";

export function rmBootstrapStorageKey(userId: string, istYmd: string): string {
  return `${RM_BOOTSTRAP_STORAGE_PREFIX}:${userId}:${istYmd}`;
}
