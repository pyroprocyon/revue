import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { installRevue, useInstallOffer, watchPhoneInstall } from './homeScreenInstall';

it('keeps the app installed when a pending prompt reports dismissal after appinstalled', async () => {
  vi.stubGlobal('navigator', { userAgent: 'Android' });
  watchPhoneInstall();
  const { result } = renderHook(useInstallOffer);
  let dismiss!: () => void;
  const userChoice = new Promise<{ outcome: 'dismissed' }>((resolve) => {
    dismiss = () => resolve({ outcome: 'dismissed' });
  });
  const prompt = vi.fn().mockResolvedValue(undefined);
  act(() => {
    window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice }));
  });
  let installation!: Promise<void>;
  act(() => {
    installation = installRevue();
  });
  expect(prompt).toHaveBeenCalledOnce();
  expect(result.current).toBe('prompting');
  act(() => {
    window.dispatchEvent(new Event('appinstalled'));
  });
  await act(async () => {
    dismiss();
    await installation;
  });
  expect(result.current).toBe('installed');
});
