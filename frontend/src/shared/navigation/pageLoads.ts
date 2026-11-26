const preloadErrors = new WeakSet<Error>();

export function watchPagePreloadErrors() {
  window.addEventListener('vite:preloadError', (event) => {
    preloadErrors.add(event.payload);
  });
}

function reloadableHistoryEntry(error: Error) {
  if (!preloadErrors.has(error) || !navigator.onLine) return null;
  const state: unknown = window.history.state;
  const entry = state && typeof state === 'object' ? state : {};
  return 'revuePreloadReloaded' in entry ? null : entry;
}

export function canRecoverFromPagePreloadError(error: Error) {
  return reloadableHistoryEntry(error) !== null;
}

export function recoverFromPagePreloadError(error: Error) {
  const entry = reloadableHistoryEntry(error);
  if (entry === null) return false;

  try {
    window.history.replaceState({ ...entry, revuePreloadReloaded: true }, '');
    reloadPage();
    return true;
  } catch {
    // The marker must survive a reload so a persistent error can fall back to manual retry.
    return false;
  }
}

export function reloadPage() {
  window.location.reload();
}

export function loadPage(path: string) {
  window.location.assign(path);
}
