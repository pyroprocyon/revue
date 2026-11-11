import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandMark } from './BrandMark';

describe('BrandMark', () => {
  it('renders the favicon geometry immediately without loading an image', () => {
    const favicon = new DOMParser().parseFromString(readFileSync('public/favicon.svg', 'utf8'), 'image/svg+xml');
    const { container } = render(<BrandMark />);
    const mark = container.querySelector('svg');

    expect(mark).not.toBeNull();
    expect(mark?.getAttribute('viewBox')).toBe(favicon.documentElement.getAttribute('viewBox'));
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
    expect(mark?.getAttribute('focusable')).toBe('false');
    const shapes = Array.from(mark?.querySelectorAll('rect') ?? []);
    const expectedShapes = Array.from(favicon.querySelectorAll('rect'));
    expect(shapes).toHaveLength(expectedShapes.length);
    for (const [index, shape] of shapes.entries()) {
      for (const attribute of expectedShapes[index].attributes) {
        expect(shape.getAttribute(attribute.name)).toBe(attribute.value);
      }
    }
  });
});
