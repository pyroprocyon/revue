import { Pause, Play, Trash2, TriangleAlert, X } from 'lucide-react';
import type { Ref } from 'react';
import { useNavigate } from 'react-router';
import type { Deck } from '../application/decks';
import { ConfirmDelete } from './ConfirmDelete';
import { useDeckGateway } from './DeckProvider';
import { DeckTitleForm } from './DeckTitleForm';
import { DeckWriteProblem } from './DeckWriteProblem';
import { useDeckDraftGuard } from './UnsavedDeckChanges';
import { useDeckWrite, type DeckWriteState } from './useDecks';
import { LIBRARY_PATH } from '../../../shared/navigation/paths';
import { deletedDeckState } from '../../../shared/navigation/routeState';
import { cardCountLabel } from '../../../shared/ui/cardCount';
import { useStillMounted } from '../../../shared/ui/useStillMounted';

const deleteDeckButton =
  'pressable inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control border border-missed/40 bg-surface px-4 text-label font-bold text-missed';

type DeckSettingsProps = {
  deck: Deck;
  titleDraft: string;
  onTitleDraftChange: (title: string) => void;
  headingRef: Ref<HTMLHeadingElement>;
  archiveState: DeckWriteState;
  onArchiveChange: (archived: boolean) => Promise<void>;
  onChanged: (message: string) => void;
  onClose?: () => void;
};

export function DeckSettings({
  deck,
  titleDraft,
  onTitleDraftChange,
  headingRef,
  archiveState,
  onArchiveChange,
  onChanged,
  onClose,
}: Readonly<DeckSettingsProps>) {
  const drafts = useDeckDraftGuard();
  const gateway = useDeckGateway();
  const navigate = useNavigate();
  const write = useDeckWrite();
  const stillOnSettings = useStillMounted();
  const removes = `${cardCountLabel(deck.cardCount)} and their review progress`;

  function changeArchiveStatus() {
    const save = () => void onArchiveChange(!deck.archived);
    if (drafts.hasDrafts()) drafts.confirm(save);
    else save();
  }

  return (
    <fieldset
      className="min-w-0"
      disabled={archiveState.status === 'saving' || write.saving}
      aria-labelledby="deck-settings-title"
    >
      <div className="flex items-start gap-3">
        <h2
          id="deck-settings-title"
          ref={headingRef}
          tabIndex={-1}
          className="min-w-0 flex-1 text-section font-bold outline-none"
        >
          Deck settings
        </h2>
        {onClose && (
          <button
            type="button"
            aria-label="Close deck settings"
            onClick={onClose}
            className="pressable -mt-1 -mr-2 grid size-12 shrink-0 place-items-center rounded-control text-muted"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        )}
      </div>
      <div className="mt-6">
        <DeckTitleForm
          title={titleDraft}
          onTitleChange={onTitleDraftChange}
          saveOnlyWhenChanged
          prepareWrite={gateway.prepareWrite}
          initialTitle={deck.title}
          saveLabel="Save name"
          saving={write.saving}
          problem={<DeckWriteProblem state={write.state} namingDeck />}
          onSave={(title) =>
            void write.run(
              () => gateway.rename(deck.id, title),
              () => onChanged('Deck renamed.'),
            )
          }
        />
      </div>
      <div className="mt-7 border-t border-line pt-5">
        <h3 className="text-label font-bold">Reviews</h3>
        <p className="mt-1 text-support text-muted">
          {deck.archived
            ? 'Paused. Your cards and study progress are kept. Resuming uses your saved schedule, so overdue cards are ready to review.'
            : 'Pausing keeps this deck out of Today. Your cards and study progress stay in Library.'}
        </p>
        <button
          type="button"
          aria-label={deck.archived ? 'Resume reviews' : 'Pause reviews'}
          className="pressable mt-3 inline-flex min-h-12 items-center gap-2 rounded-control border border-line px-4 text-label font-semibold"
          onClick={changeArchiveStatus}
        >
          {deck.archived ? (
            <Play aria-hidden="true" className="size-4 shrink-0" />
          ) : (
            <Pause aria-hidden="true" className="size-4 shrink-0" />
          )}
          {deck.archived ? 'Resume' : 'Pause'}
        </button>
        <DeckWriteProblem state={archiveState} />
      </div>
      <div className="mt-7 border-t border-line pt-5">
        <h3 className="text-label font-bold">Delete deck</h3>
        <p className="mt-1 text-support text-muted">Removes {removes}.</p>
        <p className="mt-2 flex items-center gap-1.5 text-support font-bold text-missed">
          <TriangleAlert aria-hidden="true" className="size-[1.125em] shrink-0" />
          This can’t be undone.
        </p>
        <div className="mt-3">
          <ConfirmDelete
            triggerLabel="Delete deck"
            triggerIcon={Trash2}
            triggerClassName={deleteDeckButton}
            subject={deck.title}
            warning={`This permanently removes ${removes}.`}
            keepLabel="Keep deck"
            confirmLabel="Delete deck"
            deleting={write.saving}
            problem={<DeckWriteProblem state={write.state} />}
            onOpen={write.clearProblem}
            onConfirm={(close) =>
              void write.run(
                () => gateway.remove(deck.id),
                () => {
                  if (!stillOnSettings.current) return;
                  close();
                  drafts.clear();
                  void navigate(LIBRARY_PATH, { replace: true, state: deletedDeckState(deck.title) });
                },
              )
            }
          />
        </div>
      </div>
    </fieldset>
  );
}
