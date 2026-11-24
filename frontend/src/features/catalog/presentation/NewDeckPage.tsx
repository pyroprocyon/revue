import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { CreateDeckSteps } from './CreateDeckSteps';
import { useDeckGateway } from './DeckProvider';
import { DeckTitleForm } from './DeckTitleForm';
import { DeckWriteProblem } from './DeckWriteProblem';
import { useDeckWrite } from './useDecks';
import { LIBRARY_PATH, deckPath } from '../../../shared/navigation/paths';
import { CREATED_DECK } from '../../../shared/navigation/routeState';
import { NavigationLink } from '../../../shared/ui/NavigationLink';
import { WorkspaceHelpLink } from '../../../shared/ui/WorkspaceHelpLink';
import { WorkspacePage } from '../../../shared/ui/WorkspacePage';
import { useStillMounted } from '../../../shared/ui/useStillMounted';
import type { LibraryBrowsing } from './LibraryBrowsingLayout';

const MIN_SOFTWARE_KEYBOARD_HEIGHT = 120;

export function NewDeckPage() {
  const [requestId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const stillOnForm = useStillMounted();
  const gateway = useDeckGateway();
  const navigate = useNavigate();
  const { searchDecks, rememberOpenedDeck } = useOutletContext<LibraryBrowsing>();
  const write = useDeckWrite();

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport || !window.matchMedia('(pointer: coarse)').matches) return;
    const updateKeyboard = () =>
      setKeyboardOpen(window.innerHeight - viewport.height * viewport.scale >= MIN_SOFTWARE_KEYBOARD_HEIGHT);
    updateKeyboard();
    viewport.addEventListener('resize', updateKeyboard);
    return () => viewport.removeEventListener('resize', updateKeyboard);
  }, []);

  return (
    <WorkspacePage
      className={`new-deck-page${keyboardOpen ? ' new-deck-keyboard-open' : ''}`}
      title="Create a deck"
      headingAction={<WorkspaceHelpLink inTitle />}
      aboveTitle={
        <NavigationLink to={LIBRARY_PATH} aria-label="Back to Library" back className="-ml-2">
          Library
        </NavigationLink>
      }
    >
      <DeckTitleForm
        className="new-deck-form"
        intro={<CreateDeckSteps current={1} />}
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
    </WorkspacePage>
  );
}
