import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { LoadingScreen } from './MessageScreen';

describe('shared loading screen', () => {
  it('stays quiet for fast loads and announces a slow load after 300ms', () => {
    vi.useFakeTimers();
    try {
      const view = render(<MemoryRouter><LoadingScreen text="Loading the set…" /></MemoryRouter>);
      expect(screen.queryByRole('status')).toBeNull();
      act(() => { vi.advanceTimersByTime(299); });
      expect(screen.queryByRole('status')).toBeNull();
      act(() => { vi.advanceTimersByTime(1); });
      expect(screen.getByRole('status').textContent).toBe('Loading the set…');
      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels an obsolete loading notice when content arrives first', () => {
    vi.useFakeTimers();
    try {
      const view = render(<MemoryRouter><LoadingScreen text="Loading the set…" /></MemoryRouter>);
      act(() => { vi.advanceTimersByTime(50); });
      view.rerender(<MemoryRouter><h1>Loaded set</h1></MemoryRouter>);
      act(() => { vi.advanceTimersByTime(300); });
      expect(screen.getByRole('heading', { name: 'Loaded set' })).toBeDefined();
      expect(screen.queryByRole('status')).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
