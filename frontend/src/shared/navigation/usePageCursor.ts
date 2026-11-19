import { useLocation, useSearchParams } from 'react-router';
import { previousCursorsState, routeState } from './routeState';

export function usePageCursor() {
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const cursor = search.get('after') ?? undefined;
  const previousCursors = routeState(location).previousCursors ?? [];

  function goToPage(after: string | undefined, earlier: (string | undefined)[]) {
    const params = new URLSearchParams(search);
    if (after === undefined) params.delete('after');
    else params.set('after', after);
    setSearch(params, {
      state: previousCursorsState(earlier),
    });
  }

  function previousPage() {
    goToPage(previousCursors.at(-1), previousCursors.slice(0, -1));
  }

  function nextPage(after: string) {
    goToPage(after, [...previousCursors, cursor]);
  }

  return { cursor, previousPage, nextPage };
}
