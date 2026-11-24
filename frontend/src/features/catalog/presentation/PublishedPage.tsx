import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, useLocation, useNavigationType, useOutletContext, useSearchParams } from 'react-router';
import { PUBLISHED_PATH, setPath } from '../../../shared/navigation/paths';
import { OPENED_FROM_PUBLISHED } from '../../../shared/navigation/routeState';
import { FocusRequestContext, InteractionPausedContext } from '../../../shared/ui/FocusRequestContext';
import { cardCountLabel } from '../../../shared/ui/cardCount';
import { CollectionIcon } from '../../../shared/ui/CollectionIcon';
import { LoadingPlaceholder, LoadingStatus } from '../../../shared/ui/LoadingFeedback';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';
import { secondaryButton } from '../../../shared/ui/buttonStyles';
import { CollectionSearch } from './CollectionSearch';
import { CollectionTiles } from './CollectionGrid';
import { CollectionLayoutSwitch } from './CollectionLayoutSwitch';
import type { CollectionLinkItem } from './collectionItem';
import { CollectionStackContext } from './useCollectionLayoutVisible';
import { CollectionCarousel } from './DeckCarousel';
import { ReviewerSubjectIcon } from './ReviewerSubjectIcon';
import { usePublicContentQueries } from './PublicContentProvider';
import { useSavedReviewerKeys } from './useSavedSets';

const SUBJECT_HEADING_ID = 'published-subject-heading';
const TOPIC_SEARCH_DELAY_MS = 200;
const positionKey = ['published-position'] as const;

type CatalogPosition = { locationKey: string; scrollY: number; setKey: string; pageCount: number };

export function PublishedPage() {
  const { publishedSubjectsQuery } = usePublicContentQueries();
  const catalog = useQuery(publishedSubjectsQuery);
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigationType = useNavigationType();
  const interactionsPaused = useContext(InteractionPausedContext);
  const requestFocus = useContext(FocusRequestContext);
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const searchTerm = query.trim();
  const term = searchTerm.toLocaleLowerCase();
  const requestedSubject = params.get('subject') ?? '';
  const stack = params.get('view') === 'stack';
  const [lastOpenedSubject, setLastOpenedSubject] = useState(requestedSubject);
  const restoredPosition = useRef<CatalogPosition | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const catalogPosition = queryClient.getQueryData<CatalogPosition>(positionKey);
  const returning = navigationType === 'POP' && catalogPosition?.locationKey === location.key;
  const hasCatalog = catalog.data !== undefined;

  const subjects = useMemo(
    () => [...(catalog.data ?? [])].sort((left, right) => left.subject.localeCompare(right.subject)),
    [catalog.data],
  );
  const selected = subjects.find(({ subject }) => subject === requestedSubject);
  const matches = subjects.filter(({ subject }) => subject.toLocaleLowerCase().includes(term));
  const showSubjects = !selected && matches.length > 0;
  const restoreSubject = showSubjects && Boolean(lastOpenedSubject) && navigationType !== 'REPLACE';
  const subjectInView = selected?.subject;
  const subjectForAccent = hasCatalog ? subjectInView : requestedSubject;
  const topicSearch = useTopicSearch(subjectForAccent, searchTerm);
  const topics = usePublishedTopics(subjectForAccent ?? '', topicSearch);

  const restoreTopic = useCallback(
    (link: HTMLAnchorElement) => {
      if (!catalogPosition || restoredPosition.current === catalogPosition) return;
      restoredPosition.current = catalogPosition;
      const top = link.dataset.libraryDeck === catalogPosition.setKey ? catalogPosition.scrollY : 0;
      window.scrollTo({ top, behavior: 'instant' });
      if (interactionsPaused) requestFocus(link);
      else link.focus({ preventScroll: true });
    },
    [catalogPosition, interactionsPaused, requestFocus],
  );

  useLayoutEffect(() => {
    if (subjectInView && !returning && !interactionsPaused && document.activeElement !== searchInput.current) {
      document.getElementById(SUBJECT_HEADING_ID)?.focus({ preventScroll: true });
    }
  }, [subjectInView, interactionsPaused, returning]);

  function setQuery(value: string) {
    setParams(
      (current) => {
        if (value) current.set('q', value);
        else current.delete('q');
        return current;
      },
      { replace: true },
    );
  }

  function changeLayout(showStack: boolean) {
    if (stack === showStack) return;
    setParams(
      (current) => {
        if (showStack) current.set('view', 'stack');
        else current.delete('view');
        return current;
      },
      { replace: true },
    );
  }

  function rememberSubject(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    setLastOpenedSubject(event.currentTarget.dataset.libraryDeck ?? '');
  }

  function rememberTopic(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const setKey = event.currentTarget.dataset.libraryDeck;
    if (!setKey) return;
    queryClient.setQueryData<CatalogPosition>(positionKey, {
      locationKey: location.key,
      scrollY: window.scrollY,
      setKey,
      pageCount: topics.data?.pages.length ?? 1,
    });
  }

  const collectionParams = new URLSearchParams();
  const subjectSearch = params.get('subjectSearch');
  if (subjectSearch) collectionParams.set('q', subjectSearch);
  if (stack) collectionParams.set('view', 'stack');
  const collectionPath = collectionParams.size ? `${PUBLISHED_PATH}?${collectionParams}` : PUBLISHED_PATH;

  const items = matches.map(({ subject, topicCount }) => {
    const subjectParams = new URLSearchParams({ subject });
    if (query) subjectParams.set('subjectSearch', query);
    if (stack) subjectParams.set('view', 'stack');
    return {
      id: subject,
      title: subject,
      to: `${PUBLISHED_PATH}?${subjectParams}`,
      countLabel: `${topicCount} ${topicCount === 1 ? 'topic' : 'topics'}`,
      icon: <ReviewerSubjectIcon subject={subject} />,
      saved: true,
    };
  });
  const layoutCount = selected?.topicCount ?? (showSubjects ? subjects.length : 0);
  const searchTarget = selected ? 'topic' : 'subject';
  const searchLabel = `Search ${searchTarget}s`;
  const headerControls = subjects.length > 0 && (
    <CollectionSearch
      label={searchLabel}
      placeholder={searchLabel}
      clearLabel={`Clear ${searchTarget} search`}
      value={query}
      onChange={setQuery}
      inputRef={searchInput}
    />
  );

  return (
    <WorkspacePage
      title={subjectInView ?? 'Reviewers'}
      className={subjectForAccent && 'reviewer-topics'}
      headingId={subjectInView ? SUBJECT_HEADING_ID : undefined}
      headingIcon={subjectInView && <ReviewerSubjectIcon subject={subjectInView} />}
      aboveTitle={
        subjectInView && (
          <Link
            to={collectionPath}
            className="pressable header-link -ml-2"
            onClick={() => setLastOpenedSubject(subjectInView)}
          >
            <ChevronLeft aria-hidden="true" />
            Reviewers
          </Link>
        )
      }
      focusHeading={!returning && !restoreSubject && navigationType !== 'REPLACE'}
      headingAction={layoutCount > 1 && <CollectionLayoutSwitch stack={stack} onChange={changeLayout} />}
      headerControls={headerControls}
    >
      {catalog.isPending && (
        <WhenSlow>
          <LoadingPlaceholder kind="collection" blue stack={stack}>
            {requestedSubject ? 'Loading topics…' : 'Loading reviewers…'}
          </LoadingPlaceholder>
        </WhenSlow>
      )}
      {catalog.isError && !hasCatalog && (
        <section className="rounded-card border border-line bg-surface p-4">
          <p role="alert" className="font-semibold">
            Reviewers couldn’t load.
          </p>
          <button type="button" className={`${secondaryButton} mt-3`} onClick={() => void catalog.refetch()}>
            Try again
          </button>
        </section>
      )}
      {hasCatalog && subjects.length === 0 && (
        <p className="screen-enter text-muted">No reviewers are available yet.</p>
      )}
      {showSubjects && (
        <CollectionStackContext value={stack}>
          <div className="reviewer-collections" data-stack={stack || undefined}>
            <CollectionCarousel
              key={term}
              kind="subjects"
              fillsScreen
              items={items}
              initialIndex={
                restoreSubject
                  ? Math.max(
                      0,
                      matches.findIndex(({ subject }) => subject === lastOpenedSubject),
                    )
                  : 0
              }
              restoreFocus={restoreSubject}
              onOpen={rememberSubject}
            />
            <CollectionTiles
              items={items}
              kind="subjects"
              focusId={restoreSubject ? lastOpenedSubject : undefined}
              onOpen={rememberSubject}
            />
          </div>
        </CollectionStackContext>
      )}
      {selected && (
        <SubjectTopics
          key={selected.subject}
          topics={topics}
          search={topicSearch}
          searchPending={searchTerm !== topicSearch}
          stack={stack}
          returnTo={returning ? catalogPosition : undefined}
          onOpen={rememberTopic}
          onRestoreFocus={restoreTopic}
        />
      )}
      {!selected && subjects.length > 0 && matches.length === 0 && (
        <output className="block text-muted">No matching subjects.</output>
      )}
    </WorkspacePage>
  );
}

function useTopicSearch(subject: string | undefined, query: string) {
  const term = subject ? query : '';
  const [settled, setSettled] = useState({ subject, term });
  if (settled.subject !== subject) setSettled({ subject, term });
  useEffect(() => {
    if (term === settled.term) return;
    const timer = window.setTimeout(() => setSettled({ subject, term }), TOPIC_SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [subject, term, settled.term]);
  return settled.subject === subject ? settled.term : term;
}

function usePublishedTopics(subject: string, search: string) {
  const { publishedTopicsQuery } = usePublicContentQueries();
  return useInfiniteQuery({ ...publishedTopicsQuery(subject, search), enabled: Boolean(subject) });
}

function SubjectTopics({
  topics,
  search,
  searchPending,
  stack,
  returnTo,
  onOpen,
  onRestoreFocus,
}: Readonly<{
  topics: ReturnType<typeof usePublishedTopics>;
  search: string;
  searchPending: boolean;
  stack: boolean;
  returnTo?: CatalogPosition;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
  onRestoreFocus: (link: HTMLAnchorElement) => void;
}>) {
  const { username } = useOutletContext<{ username: string }>();
  const saved = useSavedReviewerKeys(username);
  const savedKeys = useMemo(() => new Set(saved.data), [saved.data]);
  const items = useMemo<CollectionLinkItem[]>(
    () =>
      topics.data?.pages.flatMap((page) =>
        page.items.map((set) => ({
          id: set.setKey,
          title: set.title,
          to: setPath(set.setKey),
          state: OPENED_FROM_PUBLISHED,
          countLabel: cardCountLabel(set.cardCount),
          icon: <CollectionIcon kind="topic" />,
          saved: true,
          inLibrary: savedKeys.has(set.setKey),
        })),
      ) ?? [],
    [topics.data, savedKeys],
  );
  const { fetchNextPage, hasNextPage, isFetching, isError } = topics;
  const canLoadMore = hasNextPage && !isFetching && !isError && !searchPending;
  const loadMore = useCallback(() => {
    void fetchNextPage({ cancelRefetch: false });
  }, [fetchNextPage]);
  const restoredIndex = items.findIndex(({ id }) => id === returnTo?.setKey);
  const pageCount = topics.data?.pages.length ?? 0;
  const restoringTopic = returnTo && restoredIndex < 0 && pageCount < returnTo.pageCount && hasNextPage && !isError;
  useEffect(() => {
    if (restoringTopic && canLoadMore) loadMore();
  }, [restoringTopic, canLoadMore, loadMore]);
  if (searchPending || topics.isPending || restoringTopic) {
    return (
      <WhenSlow>
        <LoadingPlaceholder kind="collection" blue stack={stack}>
          Loading topics…
        </LoadingPlaceholder>
      </WhenSlow>
    );
  }

  const focusId = returnTo ? items[Math.max(0, restoredIndex)]?.id : undefined;
  return (
    <CollectionStackContext value={stack}>
      <div className="reviewer-collections" data-stack={stack || undefined}>
        {items.length > 0 && (
          <>
            <CollectionCarousel
              key={search}
              kind="topics"
              fillsScreen
              items={items}
              initialIndex={Math.max(0, restoredIndex)}
              restoreFocus={focusId !== undefined}
              onRestoreFocus={onRestoreFocus}
              onOpen={onOpen}
              onNearEnd={canLoadMore ? loadMore : undefined}
            />
            <CollectionTiles
              kind="topics"
              items={items}
              focusId={focusId}
              onRestoreFocus={onRestoreFocus}
              onOpen={onOpen}
              onNearEnd={canLoadMore ? loadMore : undefined}
            />
          </>
        )}
        {topics.isFetchingNextPage && (
          <WhenSlow>
            <LoadingStatus className="mt-3">Loading more topics…</LoadingStatus>
          </WhenSlow>
        )}
        {items.length === 0 && !topics.isError && <output className="block text-muted">No matching topics.</output>}
        {topics.isError && (
          <section className="mt-3 rounded-card border border-line bg-surface p-4">
            <p role="alert" className="font-semibold">
              Topics couldn’t load.
            </p>
            <button
              type="button"
              className={`${secondaryButton} mt-3`}
              disabled={topics.isFetching}
              onClick={() => void (topics.isFetchNextPageError ? topics.fetchNextPage() : topics.refetch())}
            >
              Try again
            </button>
          </section>
        )}
      </div>
    </CollectionStackContext>
  );
}
