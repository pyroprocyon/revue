import { useSyncExternalStore } from 'react';

type InstallEvent = Event & {
  prompt(): Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
type InstallOffer = InstallEvent | 'prompting' | 'installed' | null;

let offer: InstallOffer = null;
const changes = new EventTarget();

function setOffer(next: InstallOffer) {
  offer = next;
  changes.dispatchEvent(new Event('change'));
}

function subscribe(listener: () => void) {
  changes.addEventListener('change', listener);
  return () => changes.removeEventListener('change', listener);
}

export function useInstallOffer() {
  return useSyncExternalStore(subscribe, () => offer);
}

export function watchPhoneInstall() {
  if (!/Android/i.test(navigator.userAgent)) return;
  // Chrome can offer installation before the learner navigates to Help.
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    setOffer(event as InstallEvent);
  });
  window.addEventListener('appinstalled', () => setOffer('installed'));
}

export async function installRevue() {
  const event = offer;
  if (!event || typeof event === 'string') return;
  setOffer('prompting');
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (offer === 'prompting' && choice.outcome === 'accepted') setOffer('installed');
  } finally {
    // A prompt is single-use. Keep any fresh offer or appinstalled event received while it was open.
    if (offer === 'prompting') setOffer(null);
  }
}
