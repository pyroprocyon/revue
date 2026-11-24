import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { CreateDeckSteps } from './CreateDeckSteps';
import { useDeckGateway } from './DeckProvider';
import { DeckTitleForm } from './DeckTitleForm';
import { DeckWriteProblem } from './DeckWriteProblem';
import { useDeckWrite } from './useDecks';
import { LIBRARY_PATH, deckPath } from '../../../shared/navigation/paths';
import { CREATED_DECK } from '../../../shared/navigation/routeState';
import { NavigationLink } from '../../../shared/ui/NavigationLink';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';
import { useStillMounted } from '../../../shared/ui/useStillMounted';
import type { LibraryBrowsing } from './LibraryBrowsingLayout';

export function NewDeckPage() {
  const [requestId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState('');
  const stillOnForm = useStillMounted();
  const gateway = useDeckGateway();
  const navigate = useNavigate();
  const { searchDecks, rememberOpenedDeck } = useOutletContext<LibraryBrowsing>();
  const write = useDeckWrite();
  return (
    <WorkspacePage
      title="Create a deck"
      aboveTitle={
        <NavigationLink to={LIBRARY_PATH} aria-label="Back to Library" back>
          Library
        </NavigationLink>
      }
    >
      <CreateDeckSteps current={1} />
      <div className="max-w-lg rounded-card border border-line bg-surface p-compact-gutter shadow-control sm:p-6">
        <DeckTitleForm
          title={title}
          onTitleChange={setTitle}
          prepareWrite={gateway.prepareWrite}
          note="Only you can see it"
          placeholder="e.g. Anatomy midterms"
          saveLabel="Create"
          savingLabel="Creating…"
          saving={write.saving}
          problem={<DeckWriteProblem state={write.state} namingDeck />}
          onCancel={() => void navigate(LIBRARY_PATH)}
          onSave={(submittedTitle, saved) =>
            void write.run(
              () => gateway.create(submittedTitle, requestId),
              (deck) => {
                if (!stillOnForm.current) return;
                saved();
                searchDecks('');
                rememberOpenedDeck(deck.id);
                void navigate(deckPath(deck.id), { replace: true, state: CREATED_DECK });
              },
            )
          }
        />
      </div>
    </WorkspacePage>
  );
}
