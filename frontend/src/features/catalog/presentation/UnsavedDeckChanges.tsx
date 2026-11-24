import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Outlet, useBlocker, useOutletContext } from 'react-router';
import { primaryButton, secondaryButton } from '../../../shared/ui/buttonStyles';
import { InteractionPausedContext } from '../../../shared/ui/FocusRequestContext';

type DraftGuard = {
  hasDrafts: () => boolean;
  register: (id: string) => () => void;
  confirm: (action: () => void) => void;
  clear: () => void;
};
const DraftContext = createContext<DraftGuard | null>(null);
const HasDraftsContext = createContext(false);

export function UnsavedDeckChanges() {
  const account = useOutletContext();
  const drafts = useRef(new Set<string>());
  const [hasDrafts, setHasDrafts] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const guard = useMemo<DraftGuard>(
    () => ({
      hasDrafts: () => drafts.current.size > 0,
      register(id) {
        drafts.current.add(id);
        setHasDrafts(true);
        return () => {
          drafts.current.delete(id);
          setHasDrafts(drafts.current.size > 0);
        };
      },
      confirm(action) {
        setPendingAction(() => action);
      },
      clear() {
        drafts.current.clear();
        setHasDrafts(false);
      },
    }),
    [],
  );
  const blocker = useBlocker(guard.hasDrafts);
  const interactionsPaused = useContext(InteractionPausedContext);
  // A modal dialog escapes its ancestors' inert state, so the prompt waits until the session check ends.
  const showPrompt = (pendingAction !== null || blocker.state === 'blocked') && !interactionsPaused;
  // React Router applies guard changes as transitions, so Back right after Keep editing can reset and block again in
  // one render. Keep editing has already closed the old dialog, so each blocked navigation mounts a fresh one.
  const promptKey = blocker.location?.key ?? 'confirm';

  useEffect(() => {
    function warnOnUnload(event: BeforeUnloadEvent) {
      if (drafts.current.size === 0) return;
      event.preventDefault();
    }
    window.addEventListener('beforeunload', warnOnUnload);
    return () => window.removeEventListener('beforeunload', warnOnUnload);
  }, []);

  function stay() {
    setPendingAction(null);
    if (blocker.state === 'blocked') blocker.reset();
  }
  function discard() {
    setPendingAction(null);
    if (pendingAction) pendingAction();
    else if (blocker.state === 'blocked') blocker.proceed();
  }

  return (
    <DraftContext value={guard}>
      <HasDraftsContext value={hasDrafts}>
        <Outlet context={account} />
      </HasDraftsContext>
      {showPrompt && <DiscardDialog key={promptKey} onStay={stay} onDiscard={discard} />}
    </DraftContext>
  );
}

export function useDeckDraftGuard() {
  const guard = useContext(DraftContext);
  if (!guard) throw new Error('Deck editors need UnsavedDeckChanges');
  return guard;
}

export function useReadDeckDrafts() {
  return useContext(DraftContext)?.hasDrafts;
}

export function useHasUnsavedDeckChanges() {
  return useContext(HasDraftsContext);
}

export function useUnsavedDeckForm(dirty: boolean) {
  const guard = useDeckDraftGuard();
  const id = useId();
  const unregister = useRef<(() => void) | undefined>(undefined);
  const forgetDraft = useCallback(() => {
    unregister.current?.();
    unregister.current = undefined;
  }, []);
  useEffect(() => {
    if (dirty) unregister.current = guard.register(id);
    return forgetDraft;
  }, [dirty, guard, id, forgetDraft]);
  function cancel(action: () => void) {
    if (!unregister.current) {
      action();
      return;
    }
    guard.confirm(() => {
      forgetDraft();
      action();
    });
  }
  return { saved: forgetDraft, cancel };
}

function DiscardDialog({ onStay, onDiscard }: Readonly<{ onStay: () => void; onDiscard: () => void }>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  function stay() {
    dialog.current?.close();
    onStay();
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        stay();
      }}
      className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-md overflow-y-auto rounded-card bg-surface p-compact-gutter text-ink shadow-card backdrop:bg-scrim/40 sm:p-6"
    >
      <h2 id={headingId} className="text-section font-bold">
        Discard your changes?
      </h2>
      <p id={descriptionId} className="mt-3 text-body text-muted">
        Your unsaved text will be lost.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button type="button" className={primaryButton} onClick={stay}>
          Keep editing
        </button>
        <button type="button" className={secondaryButton} onClick={onDiscard}>
          Discard changes
        </button>
      </div>
    </dialog>
  );
}
