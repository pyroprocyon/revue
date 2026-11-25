const SESSION_REVISION = 'revue.session-revision';
const fallbackChecks = new Set<() => void>();
let fallbackChannel: BroadcastChannel | null = null;
let fallbackRevision = 0;

export function sessionRevision(): string | null | undefined {
  try {
    return localStorage.getItem(SESSION_REVISION);
  } catch {
    return undefined;
  }
}

export function sessionSnapshot(): string {
  return JSON.stringify({ revision: sessionRevision(), fallbackRevision });
}

export function announceSessionChange() {
  try {
    localStorage.setItem(SESSION_REVISION, crypto.randomUUID());
  } catch {
    // Storage can be blocked or full. Awake tabs can still receive a direct notification.
    const channel = fallbackChannel ?? openSessionChannel();
    channel?.postMessage('changed');
    if (channel !== fallbackChannel) channel?.close();
    notifyFallbackChange();
  }
}

function openSessionChannel() {
  try {
    return new BroadcastChannel(SESSION_REVISION);
  } catch {
    return null;
  }
}

function notifyFallbackChange() {
  fallbackRevision += 1;
  fallbackChecks.forEach((check) => check());
}

export function onSessionChange(checkRevision: () => void, forceCheck: () => void) {
  function storageChanged(event: StorageEvent) {
    if (event.key === SESSION_REVISION || event.key === null) checkRevision();
  }
  if (fallbackChecks.size === 0) {
    fallbackChannel = openSessionChannel();
    fallbackChannel?.addEventListener('message', notifyFallbackChange);
  }
  fallbackChecks.add(forceCheck);
  window.addEventListener('storage', storageChanged);
  return () => {
    fallbackChecks.delete(forceCheck);
    if (fallbackChecks.size === 0) {
      fallbackChannel?.close();
      fallbackChannel = null;
    }
    window.removeEventListener('storage', storageChanged);
  };
}
