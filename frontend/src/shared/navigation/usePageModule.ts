import { useEffect, useState, type FunctionComponent } from 'react';

export function pageModule<Props extends object>(load: () => Promise<FunctionComponent<Props>>) {
  type Result = { component: FunctionComponent<Props> } | { error: unknown };
  let request: Promise<FunctionComponent<Props>> | undefined;
  let loaded: Result | undefined;

  function preload() {
    request ??= load().then((component) => {
      loaded = { component };
      return component;
    });
    return request;
  }

  function usePageModule(enabled = true) {
    const [result, setResult] = useState(loaded);
    useEffect(() => {
      if (!enabled) return;
      let active = true;
      void preload().then(
        (component) => {
          if (active) setResult({ component });
        },
        (error: unknown) => {
          if (active) setResult({ error });
        },
      );
      return () => {
        active = false;
      };
    }, [enabled]);
    return result;
  }
  return { usePageModule, preload };
}
