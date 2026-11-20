const SESSION_REVISION = 'revue.session-revision';

export function sessionRevision(): string | null | undefined {
  try {
    return localStorage.getItem(SESSION_REVISION);
  } catch {
    return undefined;
  }
}

export function announceSessionChange() {
  try {
    localStorage.setItem(SESSION_REVISION, crypto.randomUUID());
  } catch {
    // Storage can be blocked or full. Awake tabs can still receive a direct notification.
    const channel = openSessionChannel();
    channel?.postMessage('changed');
    channel?.close();
  }
}

function openSessionChannel() {
  try {
    return new BroadcastChannel(SESSION_REVISION);
  } catch {
    return null;
  }
}

export function onSessionChange(checkRevision: () => void, forceCheck: () => void) {
  function storageChanged(event: StorageEvent) {
    if (event.key === SESSION_REVISION || event.key === null) checkRevision();
  }
  const channel = openSessionChannel();
  channel?.addEventListener('message', forceCheck);
  window.addEventListener('storage', storageChanged);
  return () => {
    channel?.close();
    window.removeEventListener('storage', storageChanged);
  };
}
