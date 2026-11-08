import { parseSync, Visitor } from 'rolldown/utils';
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob<string>('./{app,features,shared}/**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
});

function dependencies(file: string, source: string): string[] {
  const parsed = parseSync(file, source);
  expect(parsed.errors, file).toEqual([]);
  const result: string[] = [];
  const visitor = new Visitor({
    ImportDeclaration: (node) => { result.push(node.source.value); },
    ExportNamedDeclaration: (node) => { if (node.source) result.push(node.source.value); },
    ExportAllDeclaration: (node) => { result.push(node.source.value); },
    ImportExpression: (node) => {
      if (node.source.type !== 'Literal' || typeof node.source.value !== 'string') {
        throw new Error(`${file}: imports must have a statically checkable path`);
      }
      result.push(node.source.value);
    },
  });
  visitor.visit(parsed.program);
  return result;
}

function violations(file: string, source: string): string[] {
  return dependencies(file, source).filter((dependency) => {
    const target = dependency.startsWith('.')
      ? new URL(dependency, new URL(file, 'https://architecture.test/')).pathname
      : dependency;
    if (file.includes('/domain/')) {
      const ownDomain = file.slice(1, file.indexOf('/domain/') + '/domain/'.length);
      return !target.startsWith(ownDomain);
    }
    if (file.includes('/application/')) {
      return target.includes('/infrastructure/') || target.includes('/presentation/') || target.startsWith('/app/');
    }
    if (file.includes('/presentation/')) {
      return target.includes('/infrastructure/') || target.startsWith('/app/');
    }
    if (file.startsWith('./shared/')) return target.startsWith('/features/') || target.startsWith('/app/');
    return false;
  }).map((dependency) => `${file} -> ${dependency}`);
}

describe('frontend architecture', () => {
  it('keeps the domain pure and wires adapters only at the application root', () => {
    const production = Object.entries(sources).filter(([file]) => !file.includes('.test.'));
    expect(production.length).toBeGreaterThan(0);
    expect(production.flatMap(([file, source]) => violations(file, source))).toEqual([]);
  });

  it('detects framework imports, type imports and dynamic adapter imports', () => {
    expect(violations('./features/study/domain/example.ts', "import type { ReactNode } from 'react';")).toHaveLength(1);
    expect(violations('./features/catalog/application/example.ts', "import('../infrastructure/http');")).toHaveLength(1);
    expect(violations('./shared/example.ts', "export * from '../app/App';")).toHaveLength(1);
  });
});
