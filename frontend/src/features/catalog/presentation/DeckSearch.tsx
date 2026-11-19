import { Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type SubmitEvent } from 'react';
import { CARD_SEARCH_MAX_LENGTH } from '../application/decks';
import { useDeckDraftGuard, useHasUnsavedDeckChanges } from './UnsavedDeckChanges';

const SEARCH_DELAY_MS = 300;

export function DeckSearch({
  term,
  onSearch,
  onClear,
  focusOnMount = false,
}: Readonly<{
  term: string;
  onSearch: (value: string) => void;
  onClear: () => void;
  focusOnMount?: boolean;
}>) {
  const [input, setInput] = useState({ term, value: term, requestedTerm: null as string | null });
  const [composing, setComposing] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const guard = useDeckDraftGuard();
  const hasDrafts = useHasUnsavedDeckChanges();
  const value = input.value.trim();
  if (input.term !== term) {
    setInput({ term, value: term === input.requestedTerm ? input.value : term, requestedTerm: null });
  }

  useEffect(() => {
    if (focusOnMount) field.current?.focus();
  }, [focusOnMount]);

  const applySearch = useCallback(
    (nextTerm: string) => {
      setInput((current) => ({ ...current, requestedTerm: nextTerm }));
      onSearch(nextTerm);
    },
    [onSearch],
  );

  useEffect(() => {
    if (value === term || composing || hasDrafts) return;
    timer.current = window.setTimeout(() => {
      if (!guard.hasDrafts()) applySearch(value);
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer.current);
  }, [applySearch, composing, guard, hasDrafts, term, value]);

  function search(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (composing || value === term) return;
    window.clearTimeout(timer.current);
    applySearch(value);
  }

  function clear() {
    window.clearTimeout(timer.current);
    setInput((current) => ({ ...current, value: '' }));
    field.current?.focus();
    onClear();
  }

  function escape(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Escape' || event.nativeEvent.isComposing || !input.value) return;
    event.preventDefault();
    clear();
  }

  return (
    <form
      aria-label="Search this deck"
      role="search"
      onSubmit={search}
      className="flex min-w-32 flex-1 basis-0 flex-wrap items-center gap-y-1"
    >
      <div className="relative min-w-0 flex-1 basis-full">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted"
        />
        <input
          ref={field}
          type="search"
          aria-label="Search cards"
          enterKeyHint="search"
          onKeyDown={escape}
          value={input.value}
          onChange={(event) => {
            const nextValue = event.target.value;
            setInput((current) => ({ ...current, value: nextValue }));
          }}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          placeholder="Search cards"
          maxLength={CARD_SEARCH_MAX_LENGTH}
          className="block min-h-12 w-full min-w-0 rounded-control border border-field-edge bg-field py-2 pr-12 pl-10 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent [&::-webkit-search-cancel-button]:hidden"
        />
        {input.value && (
          <button
            type="button"
            aria-label="Clear card search"
            onClick={clear}
            className="pressable absolute top-0 right-0 grid size-12 place-items-center rounded-control text-muted"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        )}
      </div>
      {hasDrafts && value !== term && (
        <output className="basis-full text-support text-muted">Finish editing to update results.</output>
      )}
    </form>
  );
}
