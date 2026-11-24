import { X } from 'lucide-react';
import type { Ref } from 'react';
import { useNavigate } from 'react-router';
import type { Deck } from '../application/decks';
import { InlineDeckDelete } from './InlineDeckDelete';
import { useDeckGateway } from './DeckProvider';
import { DeckTitleForm } from './DeckTitleForm';
import { DeckWriteProblem } from './DeckWriteProblem';
import { ReviewSettings } from './ReviewSettings';
import { useDeckDraftGuard } from './UnsavedDeckChanges';
import { useDeckWrite, type DeckWriteState } from './useDecks';
import { LIBRARY_PATH } from '../../../shared/navigation/paths';
import { deletedDeckState } from '../../../shared/navigation/routeState';
import { cardCountLabel } from '../../../shared/ui/cardCount';
import { useStillMounted } from '../../../shared/ui/useStillMounted';

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
      <ReviewSettings collection="deck" paused={deck.archived} onToggle={changeArchiveStatus}>
        <DeckWriteProblem state={archiveState} />
      </ReviewSettings>
      <InlineDeckDelete
        title={deck.title}
        removes={removes}
        deleting={write.saving}
        problem={<DeckWriteProblem state={write.state} />}
        onOpen={write.clearProblem}
        onDelete={() =>
          void write.run(
            () => gateway.remove(deck.id),
            () => {
              if (!stillOnSettings.current) return;
              drafts.clear();
              void navigate(LIBRARY_PATH, { replace: true, state: deletedDeckState(deck.title) });
            },
          )
        }
      />
    </fieldset>
  );
}
