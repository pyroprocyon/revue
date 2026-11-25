import { useFocusOnMount } from '../../../shared/ui/useFocusOnMount';
import { SessionExpiredRedirect } from '../../../shared/navigation/SessionExpiredRedirect';
import { DECK_TITLE_MAX_LENGTH, type DeckFailureReason } from '../application/decks';
import type { DeckWriteState } from './useDecks';
import { loadPage } from '../../../shared/navigation/pageLoads';
import { LIBRARY_PATH, TODAY_PATH } from '../../../shared/navigation/paths';
import { primaryButton } from '../../../shared/ui/buttonStyles';

const PROBLEM_TEXT: Record<Exclude<DeckFailureReason, 'signed-out'>, string> = {
  'stale-card':
    'This card changed in another tab. Copy any text you want to keep, then close and reopen the editor to see the latest version.',
  'create-conflict': 'This save was already used. Check your Library before starting a new entry.',
  'expired-form': 'Your form expired. Please try again.',
  'not-found': 'This is no longer in your Library. It may have been deleted in another tab.',
  invalid: 'Check the text and try again. A card needs a question and an answer.',
  'deck-limit': 'Your account has reached its deck limit. Delete a deck to create another.',
  'card-limit': 'Your account has reached its card limit. Delete some cards to add more.',
  outdated:
    'Revue changed while this page was open, so this wasn’t sent. Copy anything you typed, then go to Today. Your decks are still saved, and you can edit them again once they’re back.',
  unknown: 'We couldn’t confirm the change. Check your connection, then check this page before trying again.',
};

export function DeckWriteProblem({
  state,
  namingDeck = false,
  focusOnFailure = false,
}: Readonly<{ state: DeckWriteState; namingDeck?: boolean; focusOnFailure?: boolean }>) {
  const alertFocus = useFocusOnMount<HTMLParagraphElement>(focusOnFailure && state.status === 'failed');
  if (state.status !== 'failed') return null;
  if (state.reason === 'signed-out') return <SessionExpiredRedirect returnTo={LIBRARY_PATH} />;
  const message =
    namingDeck && state.reason === 'invalid'
      ? `Enter a deck name with ${DECK_TITLE_MAX_LENGTH} characters or fewer.`
      : PROBLEM_TEXT[state.reason];
  return (
    <div
      className={`rounded-inset bg-highlight-soft p-4 text-support text-ink ${focusOnFailure ? '@max-[17rem]/workspace:p-2' : ''}`}
    >
      <p role="alert" {...(focusOnFailure && alertFocus)}>
        {message}
      </p>
      {state.reason === 'outdated' && (
        <button type="button" onClick={() => loadPage(TODAY_PATH)} className={`${primaryButton} mt-3`}>
          Go to Today
        </button>
      )}
    </div>
  );
}
