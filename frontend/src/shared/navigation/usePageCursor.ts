import { useLocation, useSearchParams } from 'react-router';
import { previousCursorsState, routeState } from './routeState';

export function usePageCursor() {
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const cursor = search.get('after') ?? undefined;
  const previousCursors = routeState(location).previousCursors ?? [];

  function previousPage() {
    const previous = previousCursors.at(-1);
    setSearch(previous === undefined ? {} : { after: previous }, {
      state: previousCursorsState(previousCursors.slice(0, -1)),
    });
  }

  function nextPage(after: string) {
    setSearch({ after }, { state: previousCursorsState([...previousCursors, cursor]) });
  }

  return { cursor, previousPage, nextPage };
}
