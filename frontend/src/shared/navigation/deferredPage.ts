import { createElement, lazy, useState, type FunctionComponent } from 'react';

export function deferredPage<Props extends object>(load: () => Promise<FunctionComponent<Props>>) {
  let loaded: FunctionComponent<Props> | undefined;
  let request: Promise<{ default: FunctionComponent<Props> }> | undefined;
  function preload() {
    request ??= load().then((component) => {
      loaded = component;
      return { default: component };
    });
    return request;
  }
  const LazyPage = lazy(preload);
  function Page(props: Props) {
    const [Component] = useState(() => loaded ?? LazyPage);
    return createElement(Component, props);
  }
  return { Page, preload };
}
