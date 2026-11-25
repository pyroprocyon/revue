import { ChevronLeft } from 'lucide-react';
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { InteractionPausedContext } from '../../../shared/ui/FocusRequestContext';

export type CardControls = { edit: ReactNode; remove: ReactNode };

export const CardScreenBar = createContext<{ slot: HTMLElement | null } | null>(null);

type CardScreenProps = {
  label: string;
  backLabel: string;
  onBack: () => void;
  topAction?: ReactNode;
  formActionsInBar?: boolean;
  /** Changes when the screen switches between the card and a form, so focus moves with it. */
  view: string;
  /** Takes focus for each view instead of the first button. Forms focus their own heading. */
  focusTarget?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

/** One dialog stays open while it switches between the card and a form, so the screen never flashes. */
export function CardScreen({
  label,
  backLabel,
  onBack,
  topAction,
  formActionsInBar = false,
  view,
  focusTarget,
  children,
}: Readonly<CardScreenProps>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [barSlot, setBarSlot] = useState<HTMLDivElement | null>(null);
  const bar = useMemo(() => (formActionsInBar ? { slot: barSlot } : null), [formActionsInBar, barSlot]);
  const interactionsPaused = useContext(InteractionPausedContext);

  // A modal dialog escapes its ancestors' inert state. It hides while the session is checked and returns
  // afterward with its content, so an unsaved draft survives the check.
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (interactionsPaused) {
      element.close();
      return;
    }
    if (element.open) return;
    // A turned tablet can move an open form here while a discard prompt is showing. Opening on top would
    // hide that prompt, so the screen waits for it to close.
    const prompt = [...document.querySelectorAll('dialog')].find((other) => other !== element && other.open);
    if (!prompt) {
      element.showModal();
      return;
    }
    const openAfterPrompt = () => {
      if (!element.open) element.showModal();
    };
    prompt.addEventListener('close', openAfterPrompt, { once: true });
    return () => prompt.removeEventListener('close', openAfterPrompt);
  }, [interactionsPaused]);

  useLayoutEffect(() => {
    const element = dialog.current;
    return () => element?.close();
  }, []);

  useLayoutEffect(() => {
    focusTarget?.current?.focus();
  }, [view, focusTarget]);

  return (
    <dialog
      ref={dialog}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        const formIsSaving = event.currentTarget.querySelector('form[aria-busy="true"]') !== null;
        if (event.target === event.currentTarget && !formIsSaving) onBack();
      }}
      className="workspace-sheet m-0 h-dvh max-h-none w-full max-w-none bg-page p-0 text-ink backdrop:bg-transparent open:flex open:flex-col"
    >
      <div className="page-gutters flex shrink-0 flex-wrap items-center gap-2 border-b border-line pt-[calc(max(0.5rem,var(--reading-header-inset))_+_var(--page-top-gutter))] pb-2">
        {formActionsInBar ? (
          <div ref={setBarSlot} className="contents" />
        ) : (
          <>
            <button
              type="button"
              aria-label={`Back to ${backLabel.toLowerCase()}`}
              onClick={onBack}
              className="pressable header-link -ml-2"
            >
              <ChevronLeft aria-hidden="true" />
              <span className="min-w-0 wrap-anywhere">{backLabel}</span>
            </button>
            {topAction && <div className="ml-auto">{topAction}</div>}
          </>
        )}
      </div>
      <div className="page-gutters min-h-0 flex-1 overflow-y-auto pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <CardScreenBar value={bar}>{children}</CardScreenBar>
      </div>
    </dialog>
  );
}
