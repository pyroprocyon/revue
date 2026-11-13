import { useLocation, useSearchParams } from 'react-router';

export function usePageCursor() {
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const cursor = search.get('after') ?? undefined;
  const previousCursors: (string | undefined)[] = location.state?.previousCursors ?? [];

  function previousPage() {
    const previous = previousCursors.at(-1);
    setSearch(previous === undefined ? {} : { after: previous }, {
      state: { previousCursors: previousCursors.slice(0, -1) },
    });
  }

  function nextPage(after: string) {
    setSearch({ after }, { state: { previousCursors: [...previousCursors, cursor] } });
  }

  return { cursor, previousPage, nextPage };
}
