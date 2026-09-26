// Keep writes in edit order, including writes started by different screen mounts.
const pending = new Map<string, Promise<unknown>>();

export function enqueueDraftSave<T>(key: string, save: () => Promise<T>): Promise<T> {
  const result = (pending.get(key) ?? Promise.resolve()).catch(() => undefined).then(save);
  pending.set(key, result);
  void result.finally(() => {
    if (pending.get(key) === result) pending.delete(key);
  }).catch(() => undefined);
  return result;
}

export async function waitForDraftSave(key: string): Promise<void> {
  await pending.get(key);
}

export async function finishPendingDraftSaves(): Promise<void> {
  await Promise.all(pending.values());
}
