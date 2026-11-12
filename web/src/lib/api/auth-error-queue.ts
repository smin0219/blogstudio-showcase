const STORAGE_KEY = "blogstudio_auth_error_queue";
const MAX_QUEUE_SIZE = 50;

export interface AuthErrorQueueItem {
  source?: string;
  email?: string;
  errorMessage?: string;
  stackTrace?: string;
  timestamp: number;
}

function getQueue(): AuthErrorQueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthErrorQueueItem[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(items: AuthErrorQueueItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(items.slice(-MAX_QUEUE_SIZE)),
    );
  } catch {
    // ignore
  }
}

export function addToAuthErrorQueue(
  item: Omit<AuthErrorQueueItem, "timestamp">,
): void {
  const queue = getQueue();
  queue.push({ ...item, timestamp: Date.now() });
  saveQueue(queue);
}

export function getAuthErrorQueue(): AuthErrorQueueItem[] {
  return getQueue();
}

export function removeAuthErrorQueueItem(index: number): void {
  const queue = getQueue();
  queue.splice(index, 1);
  saveQueue(queue);
}

export function clearAuthErrorQueue(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
