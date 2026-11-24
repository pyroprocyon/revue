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

    advance(340);
    expect(result.current).toBe(false);
    rerender(false);
    advance(1000);
    expect(result.current).toBe(false);
  });

  it('gives a shown notice time to be read when the load finishes just after the delay', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const { result, rerender } = renderHook(useFirstLoadNotice, { initialProps: true });

    advance(499);
    expect(result.current).toBe(false);
    advance(21);
    expect(result.current).toBe(true);
    rerender(false);
    advance(179);
    expect(result.current).toBe(true);
    advance(1);
    expect(result.current).toBe(false);
  });

  it('releases a slow load as soon as the notice has already had time to display', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const { result, rerender } = renderHook(useFirstLoadNotice, { initialProps: true });

    advance(800);
    expect(result.current).toBe(true);
    rerender(false);
    advance(0);
    expect(result.current).toBe(false);
  });
});
