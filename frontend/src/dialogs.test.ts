import { describe, expect, it } from 'vitest';

const sources = import.meta.glob<string>('./**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function modalsIgnoringPause(files: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(([file, source]) => !file.endsWith('.test.tsx') && source.includes('.showModal('))
    .filter(([, source]) => !source.includes('InteractionPausedContext'))
    .map(([file]) => file);
}

describe('modal dialogs', () => {
  it('respond when the session check pauses private interactions', () => {
    expect(Object.values(sources).some((source) => source.includes('.showModal('))).toBe(true);
    expect(modalsIgnoringPause(sources)).toEqual([]);
  });

  it('detects a modal that never reads the paused state', () => {
    expect(
      modalsIgnoringPause({
        './Ignores.tsx': 'dialog.current?.showModal();',
        './Responds.tsx': 'useContext(InteractionPausedContext); dialog.current?.showModal();',
        './Opens.test.tsx': 'dialog.current?.showModal();',
      }),
    ).toEqual(['./Ignores.tsx']);
  });
});
