import { useSyncExternalStore } from 'react';

const storageKey = 'revue.solid-controls';
const attribute = 'data-solid-controls';
const changes = new EventTarget();

function applySolidControls(enabled: boolean) {
  document.documentElement.toggleAttribute(attribute, enabled);
  changes.dispatchEvent(new Event('change'));
}

function restoreSolidControls() {
  try {
    applySolidControls(localStorage.getItem(storageKey) === 'true');
  } catch {
    // Browsers can deny storage access. Keep the current tab's preference in that case.
  }
}

export function watchSolidControls() {
  restoreSolidControls();
  window.addEventListener('storage', ({ key }) => {
    if (key === storageKey || key === null) restoreSolidControls();
  });
}

export function setSolidControls(enabled: boolean) {
  applySolidControls(enabled);
  try {
    localStorage.setItem(storageKey, String(enabled));
  } catch {
    // The preference still applies in the current tab when storage is unavailable.
  }
}

function subscribe(listener: () => void) {
  changes.addEventListener('change', listener);
  return () => changes.removeEventListener('change', listener);
}

export function useSolidControls() {
  return useSyncExternalStore(subscribe, () => document.documentElement.hasAttribute(attribute));
}
