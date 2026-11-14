import { Link, Navigate, useOutletContext } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { LibraryBig } from 'lucide-react';
import type { AccountProfile } from '../../account/application/account';
import { LibraryFailure } from '../application/library';
import { useSavedSets } from './useSavedSets';
import { RemoveSetAction } from './RemoveSetAction';
import { LIBRARY_PATH, SIGN_IN_PATH, setPath } from '../../../shared/navigation/paths';
import { PageControls } from '../../../shared/ui/PageControls';
import { usePageCursor } from '../../../shared/navigation/usePageCursor';
import { primaryButton, secondaryButton, textLink, textLinkTarget } from '../../../shared/ui/buttonStyles';
import { WhenSlow } from '../../../shared/ui/WhenSlow';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';

export function LibraryPage() {
  const profile = useOutletContext<AccountProfile>();
  const { cursor: after, previousPage, nextPage } = usePageCursor();
  const library = useSavedSets(profile.username, after);
  const [removed, setRemoved] = useState<{ title: string; restoreFocus: boolean } | null>(null);
  const notice = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    if (removed?.restoreFocus && document.activeElement === document.body) notice.current?.focus();
  }, [removed]);
  if (library.error instanceof LibraryFailure && library.error.reason === 'signed-out') {
    return <Navigate replace to={`${SIGN_IN_PATH}?${new URLSearchParams({ returnTo: LIBRARY_PATH })}`} />;
  }
  const nextCursor = library.data?.nextCursor;
  return <WorkspacePage title="Library">
    {removed && <output ref={notice} tabIndex={-1} className="mb-6 block rounded-control bg-accent-soft p-compact-gutter text-support text-accent-strong wrap-anywhere focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Removed “{removed.title}” from your Library. Your progress is kept.</output>}
    {library.isPending && <WhenSlow><output className="block">Loading your Library…</output></WhenSlow>}
    {library.isError && <div>
      <p role="alert" className="mb-4 text-muted">Your Library couldn’t load. Check your connection and try again.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={primaryButton} onClick={() => void library.refetch()} disabled={library.isFetching}>
          {library.isFetching ? 'Retrying…' : 'Try again'}
        </button>
        {after !== undefined && <button type="button" className={secondaryButton} onClick={previousPage}>Previous</button>}
      </div>
    </div>}
    {library.isSuccess && <>
      {library.data.items.length === 0 && <div className="rounded-card bg-surface p-compact-gutter py-6 shadow-card sm:p-8 lg:p-10">
        <span className="mb-5 grid size-12 place-items-center rounded-control bg-accent-soft text-accent"><LibraryBig aria-hidden="true" className="size-6" /></span>
        <h2 className="text-section font-bold">{after ? 'No more saved sets' : 'No saved sets'}</h2>
        {after && <p className="mt-3 text-body text-muted">Go back to see your saved sets.</p>}
      </div>}
      <ul className="grid gap-4 @min-[38rem]:grid-cols-2">
        {library.data.items.map((set) => <li key={set.id} className="flex min-w-0 flex-col rounded-card bg-surface p-compact-gutter shadow-card sm:p-6">
          <h2 className="text-section font-bold tracking-tight wrap-anywhere">{set.title}</h2>
          <p className="mt-2 text-support text-muted wrap-anywhere">By {set.publisherName} · {set.cardCount}&nbsp;{set.cardCount === 1 ? 'card' : 'cards'}</p>
          <p className="mt-4 flex-1 text-body text-muted wrap-anywhere">{set.description}</p>
          {set.retired && <p className="mt-4 text-support font-semibold">No longer offered · Still in your Library</p>}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            {!set.retired && <Link to={setPath(set.setKey)} className={`${textLink} ${textLinkTarget}`} aria-label={`View set: ${set.title}`}>View set</Link>}
            <RemoveSetAction set={set} username={profile.username} onRemoved={(title, restoreFocus) => setRemoved({ title, restoreFocus })} />
          </div>
        </li>)}
      </ul>
      {(after !== undefined || nextCursor) && (
        <PageControls
          label="Library pages"
          onPrevious={after === undefined ? undefined : previousPage}
          onNext={nextCursor ? () => nextPage(nextCursor) : undefined}
        />
      )}
    </>}
  </WorkspacePage>;
}
