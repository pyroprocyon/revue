import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { HomeScreenHelp } from './HomeScreenHelp';

it('lets a visitor choose their phone and switch between setup instructions', () => {
  render(<HomeScreenHelp />);
  fireEvent.click(screen.getByRole('button', { name: 'Install Revue' }));
  const iphone = screen.getByRole('button', { name: 'iPhone' });
  const android = screen.getByRole('button', { name: 'Android' });

  fireEvent.click(iphone);
  expect(iphone.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText('Open as Web App')).toBeTruthy();
  fireEvent.click(android);
  expect(iphone.getAttribute('aria-pressed')).toBe('false');
  expect(android.getAttribute('aria-pressed')).toBe('true');
  expect(screen.queryByText('Open as Web App')).toBeNull();
  expect(screen.getByText('Install and create shortcut')).toBeTruthy();
});
