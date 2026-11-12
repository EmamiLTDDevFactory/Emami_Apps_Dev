/** "Back" control (web): the previous page in this tab's history, or the Emami Apps hub when there is none. */
export function goBack(): void {
  if (typeof window === 'undefined') return;
  if (window.history.length > 1) window.history.back();
  else window.location.href = '/';
}

/** "Back to Emami Apps" (web): the hub dashboard. */
export function goToEmamiApps(): void {
  if (typeof window !== 'undefined') window.location.href = '/';
}
