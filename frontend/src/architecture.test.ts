import { parseSync, Visitor } from 'rolldown/utils';
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob<string>('./**/*.{ts,tsx}', {
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
    TSImportType: (node) => { result.push(node.source.value); },
    TSExternalModuleReference: (node) => { result.push(node.expression.value); },
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
  const feature = /^\.\/features\/([^/]+)\/(domain|application|infrastructure|presentation)\//.exec(file);
  const shared = file.startsWith('./shared/');
  if (file !== './main.tsx' && !file.startsWith('./app/') && !shared && !feature) {
    return [`${file}: production code must live in app, a feature layer or shared`];
  }
  if (feature?.[2] === 'domain' && file.endsWith('.tsx')) {
    return [`${file}: domain code must use .ts so the no-DOM compilation checks it`];
  }
  return dependencies(file, source).filter((dependency) => {
    const target = dependency.startsWith('.')
      ? new URL(dependency, new URL(file, 'https://architecture.test/')).pathname
      : dependency;
    const targetLayer = /^\/features\/[^/]+\/(domain|application|infrastructure|presentation)(\/|$)/.exec(target)?.[1];
    const compositionRoot = target === '/app' || target.startsWith('/app/') || /^\/main(?:\.[jt]sx?)?$/.test(target);
    if (isTestCode(target)) return true;
    if (shared) return target.startsWith('/features/') || compositionRoot;
    if (!feature) return false;
    const [, featureName, layer] = feature;
    if (layer === 'domain') {
      const ownDomain = `/features/${featureName}/domain/`;
      return target !== ownDomain.slice(0, -1) && !target.startsWith(ownDomain);
    }
    if (layer === 'application') {
      return targetLayer === 'infrastructure' || targetLayer === 'presentation' || compositionRoot;
    }
    if (layer === 'presentation') {
      return targetLayer === 'infrastructure' || compositionRoot;
    }
    if (layer === 'infrastructure') {
      return targetLayer === 'presentation' || compositionRoot;
    }
    return false;
  }).map((dependency) => `${file} -> ${dependency}`);
}

function isTestCode(file: string): boolean {
  const path = file.startsWith('./') ? file.slice(1) : file;
  return path === '/test' || path.startsWith('/test/') || /\.(test|spec)(\.[cm]?[jt]sx?)?$/.test(path);
}

describe('frontend architecture', () => {
  it('keeps the domain pure and wires adapters only at the application root', () => {
    const production = Object.entries(sources).filter(([file]) => !isTestCode(file));
    expect(production.length).toBeGreaterThan(0);
    expect(production.flatMap(([file, source]) => violations(file, source))).toEqual([]);
  });

  it('detects framework imports, type imports and dynamic adapter imports', () => {
    expect(violations('./features/study/domain/example.ts', "import type { ReactNode } from 'react';")).toHaveLength(1);
    expect(violations('./features/catalog/application/example.ts', "import('../infrastructure/http');")).toHaveLength(1);
    expect(violations('./shared/example.ts', "export * from '../app/App';")).toHaveLength(1);
  });

  it.each([
    ['application', "type Client = import('../infrastructure/http').Client;"],
    ['presentation', "type Client = typeof import('../infrastructure/http');"],
    ['domain', "type Component = import('react').ReactNode;"],
  ])('checks inline type imports in a future account %s layer', (layer, source) => {
    expect(violations(`./features/account/${layer}/example.ts`, source)).toHaveLength(1);
  });

  it('keeps HTTP adapters independent of presentation', () => {
    expect(violations('./features/account/infrastructure/http.ts', "import '../presentation/form';")).toHaveLength(1);
  });

  it('checks TypeScript import-equals declarations', () => {
    expect(violations('./features/account/domain/example.ts', "import type React = require('react');")).toHaveLength(1);
  });

  it.each(['application', 'infrastructure', 'presentation'])('keeps the %s layer out of the browser entry point', (layer) => {
    expect(violations(`./features/account/${layer}/example.ts`, "import '../../../main';")).toHaveLength(1);
  });

  it('rejects production files outside the declared architecture', () => {
    expect(violations('./accountClient.ts', 'export const value = 1;')).toHaveLength(1);
    expect(violations('./features/account/client.ts', 'export const value = 1;')).toHaveLength(1);
  });

  it.each([
    ['domain', "import type { AccountId } from './account';"],
    ['application', "import type { AccountId } from '../domain/account';"],
    ['infrastructure', "import type { AccountCommands } from '../application/commands';"],
    ['presentation', "import type { AccountCommands } from '../application/commands';"],
  ])('allows inward dependencies in a future account %s layer', (layer, source) => {
    expect(violations(`./features/account/${layer}/example.ts`, source)).toEqual([]);
  });

  it('rejects imports that cannot be checked statically', () => {
    expect(() => violations('./features/account/presentation/form.ts', 'import(adapterPath);'))
      .toThrow('imports must have a statically checkable path');
  });

  it.each(['application', 'presentation'])('keeps shared/%s independent of feature code', (folder) => {
    expect(violations(`./shared/${folder}/example.ts`, "import '../../features/catalog/application/publicContent';"))
      .toHaveLength(1);
  });

  it.each([
    ['./features/account/presentation/form.ts', "import '../../../test/accountGateway';"],
    ['./app/example.ts', "import './example.test';"],
    ['./app/example.ts', "export * from './example.spec';"],
  ])('rejects production imports of excluded test code from %s', (file, source) => {
    expect(violations(file, source)).toHaveLength(1);
  });

  it('keeps domain files within the no-DOM TypeScript compilation', () => {
    expect(violations('./features/account/domain/clock.tsx', 'export const title = document.title;')).toHaveLength(1);
  });

  it('allows app composition in subfolders named after a feature layer', () => {
    expect(violations('./app/presentation/example.ts', "import '../../features/account/infrastructure/http';")).toEqual([]);
  });

  it.each([
    ['application', "import '../infrastructure';"],
    ['presentation', "import '../infrastructure';"],
    ['infrastructure', "import '../presentation';"],
    ['application', "import '../../../app';"],
  ])('checks directory index imports from the %s layer', (layer, source) => {
    expect(violations(`./features/account/${layer}/example.ts`, source)).toHaveLength(1);
  });

  it('allows a domain to import its own directory index', () => {
    expect(violations('./features/account/domain/example.ts', "import type { AccountId } from '../domain';")).toEqual([]);
  });
});
