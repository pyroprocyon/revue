const preloadErrors = new WeakSet<Error>();

export function watchPagePreloadErrors() {
  window.addEventListener('vite:preloadError', (event) => {
    preloadErrors.add(event.payload);
  });
}

export function recoverFromPagePreloadError(error: Error) {
  if (!preloadErrors.has(error) || !navigator.onLine) return;
  const state: unknown = window.history.state;
  const entry = state && typeof state === 'object' ? state : {};
  if ('revuePreloadReloaded' in entry) return;

  try {
    window.history.replaceState({ ...entry, revuePreloadReloaded: true }, '');
  } catch {
    // The marker must survive a reload so a persistent error can fall back to manual retry.
    return;
  }
  reloadPage();
}

export function reloadPage() {
  window.location.reload();
}

export function loadPage(path: string) {
  window.location.assign(path);
}
