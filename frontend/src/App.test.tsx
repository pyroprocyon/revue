import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

// Smoke test for the test setup: Vitest compiles TSX, renders React into jsdom,
// and Testing Library finds elements by their accessible role.
describe('App', () => {
  it('renders the Revue heading and headline', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'Revue' })).toBeDefined();
    expect(screen.getByText('Spaced repetition for your next exam.')).toBeDefined();
  });
});
