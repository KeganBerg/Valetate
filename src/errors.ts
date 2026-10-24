/** No connection, as opposed to the server saying no. */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /failed to fetch|networkerror|network request failed|load failed|timed? ?out|fetch failed/i.test(msg);
}

/** A server or network error in words a person can act on. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/failed to fetch|network|load failed|offline/i.test(msg)) return "No signal, so that didn't save. Try again.";
  if (/jwt|expired|not authenticated/i.test(msg)) return 'Your sign-in expired. Sign in again.';
  if (/row-level security|permission denied/i.test(msg)) return "You don't have permission to do that.";
  return msg;
}
