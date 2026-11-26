import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFirstLoadNotice } from './useFirstLoadNotice';

function advance(milliseconds: number) {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

describe('first-load notice', () => {
  afterEach(() => vi.useRealTimers());

  it('skips the notice when the first load finishes before the delay', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(useFirstLoadNotice, { initialProps: true });

    advance(299);
    expect(result.current).toBe(false);
    rerender(false);
    advance(1000);
    expect(result.current).toBe(false);
  });

  it('releases ready content immediately after a notice becomes visible', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(useFirstLoadNotice, { initialProps: true });

    advance(299);
    expect(result.current).toBe(false);
    advance(1);
    expect(result.current).toBe(true);
    rerender(false);
    expect(result.current).toBe(false);
  });

  it('starts a fresh delay when another load begins', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(useFirstLoadNotice, { initialProps: true });

    advance(800);
    expect(result.current).toBe(true);
    rerender(false);
    rerender(true);
    expect(result.current).toBe(false);
    advance(300);
    expect(result.current).toBe(true);
  });
});
