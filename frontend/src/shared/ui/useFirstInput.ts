import { useRef } from 'react';

export function useFirstInput(onFirstInput: () => void) {
  const started = useRef(false);
  return () => {
    if (started.current) return;
    started.current = true;
    onFirstInput();
  };
}
