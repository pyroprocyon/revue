import { parseSync } from 'rolldown/utils';
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob<string>('./**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const TOOL_DIRECTIVE = /^\s*NOSONAR\b/;
const ONLY_INDENT_OR_JSX_BRACE = /^\s*\{?$/;

function commentsAfterCode(file: string, source: string): string[] {
  const parsed = parseSync(file, source);
  expect(parsed.errors, file).toEqual([]);
  return parsed.comments
    .filter((comment) => !TOOL_DIRECTIVE.test(comment.value))
    .filter((comment) => {
      const lineStart = source.lastIndexOf('\n', comment.start - 1) + 1;
      return !ONLY_INDENT_OR_JSX_BRACE.test(source.slice(lineStart, comment.start));
    })
    .map((comment) => `${file}:${source.slice(0, comment.start).split('\n').length}`);
}

describe('comments', () => {
  it('never follow code on the same line', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0);
    expect(Object.entries(sources).flatMap(([file, source]) => commentsAfterCode(file, source))).toEqual([]);
  });

  it('detects a comment after code and accepts a comment on its own line', () => {
    expect(commentsAfterCode('./example.ts', 'const a = 1; // why\n')).toEqual(['./example.ts:1']);
    expect(commentsAfterCode('./example.ts', 'const a = 1;\nconst b = f(0 /* why */);\n')).toEqual(['./example.ts:2']);
    expect(commentsAfterCode('./example.tsx', '// why\nconst a = <p>\n  {/* why */}\n</p>;\n')).toEqual([]);
    expect(commentsAfterCode('./example.ts', 'const a = f(0 /* NOSONAR S1: reason */);\n')).toEqual([]);
  });
});
