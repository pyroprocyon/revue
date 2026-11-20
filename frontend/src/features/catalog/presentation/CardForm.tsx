import { useFirstInput } from '../../../shared/ui/useFirstInput';
import { ChevronDown } from 'lucide-react';
import { useUnsavedDeckForm } from './UnsavedDeckChanges';
import { useContext, useEffect, useId, useRef, useState, type ReactNode, type SubmitEvent } from 'react';
import { createPortal } from 'react-dom';
import { CardScreenBar } from './CardScreen';
import { CARD_FIELD_MAX_LENGTH, type CardDraft, type DeckCard } from '../application/decks';
import { DeckWriteProblem } from './DeckWriteProblem';
import type { DeckWriteState } from './useDecks';
import { TextField } from './TextField';
import { primaryButton, secondaryButton } from '../../../shared/ui/buttonStyles';
import { useFocusOnMount } from '../../../shared/ui/useFocusOnMount';

type CardFormProps = {
  heading: string;
  card?: DeckCard;
  added?: boolean;
  writeState: DeckWriteState;
  prepareWrite: () => void;
  onSave: (draft: CardDraft) => void;
  onCancel: () => void;
  /** Owned by the page, so the text survives the form moving between the phone screen and the side pane. */
  draft: CardDraft;
  onDraftChange: (draft: CardDraft) => void;
  beforeFields?: ReactNode;
};

export function draftOf(card?: DeckCard): CardDraft {
  return {
    question: card?.question ?? '',
    answer: card?.answer ?? '',
    explanation: card?.explanation ?? '',
    memoryHook: card?.memoryHook ?? '',
    source: card?.source ?? '',
  };
}

export function draftChanged(draft: CardDraft, original: CardDraft) {
  return (Object.keys(draft) as (keyof CardDraft)[]).some((key) => draft[key] !== original[key]);
}

export function CardForm({
  heading,
  card,
  added,
  writeState,
  prepareWrite,
  onSave,
  onCancel,
  draft,
  onDraftChange,
  beforeFields,
}: Readonly<CardFormProps>) {
  const saving = writeState.status === 'saving';
  const firstInput = useFirstInput(prepareWrite);
  const [initialDraft] = useState(() => draftOf(card));
  const dirty = draftChanged(draft, initialDraft);
  const guard = useUnsavedDeckForm(dirty);
  const bar = useContext(CardScreenBar);
  const headingFocus = useFocusOnMount<HTMLHeadingElement>(bar?.slot !== null);
  const formId = useId();
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, []);

  function field(name: keyof CardDraft) {
    return {
      value: draft[name],
      maxLength: CARD_FIELD_MAX_LENGTH[name],
      onChange: (value: string) => onDraftChange({ ...draft, [name]: value }),
    };
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(draft);
  }

  const cancel = () => guard.cancel(onCancel);
  const status = added && <output className="text-support font-semibold text-accent-strong">Card added.</output>;

  return (
    <form
      id={formId}
      onInput={firstInput}
      ref={form}
      onSubmit={submit}
      onInvalid={(event) => {
        const firstInvalid = event.currentTarget.querySelector<HTMLTextAreaElement>('textarea:invalid');
        if (firstInvalid && event.target === firstInvalid) {
          firstInvalid.labels[0]?.scrollIntoView({ block: 'center', behavior: 'instant' });
        }
      }}
      aria-busy={saving}
      className={`@container/card-form scroll-mt-20 scroll-mb-24 sm:scroll-mb-4 rounded-card border border-line bg-surface p-compact-gutter sm:p-6`}
    >
      <fieldset disabled={saving} className="grid min-w-0 gap-2.5 sm:gap-4">
        {bar === null && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 {...headingFocus} className="text-section font-bold outline-none">
              {heading}
            </h2>
            {status}
          </div>
        )}
        {bar?.slot &&
          createPortal(
            <div className="flex w-full flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={cancel}
                disabled={saving}
                className="pressable -ml-1 min-h-12 shrink-0 rounded-control px-2 text-label font-semibold text-accent"
              >
                {card ? 'Cancel' : 'Done'}
              </button>
              <div className="min-w-20 flex-1 text-center leading-tight @max-[17rem]/workspace:order-first @max-[17rem]/workspace:basis-full">
                <h2 {...headingFocus} className="text-label font-bold outline-none">
                  {heading}
                </h2>
                {status}
              </div>
              <button
                type="submit"
                form={formId}
                aria-label={saving ? undefined : 'Save card'}
                disabled={saving}
                className={`${primaryButton} ml-auto shrink-0 px-4 @max-[17rem]/workspace:px-2`}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>,
            bar.slot,
          )}
        {bar && <DeckWriteProblem state={writeState} focusOnFailure />}
        {beforeFields}
        <div className="grid min-w-0 gap-2.5 sm:gap-4 @min-[34rem]/card-form:grid-cols-2">
          <TextField label="Question" growWithText rows={3} {...field('question')} />
          <TextField
            label="Answer"
            growWithText
            rows={3}
            note="Keep it to one idea"
            nearLimitNote="Add extra details under Optional details, in Explanation."
            {...field('answer')}
          />
        </div>
        <details className="group rounded-control bg-subtle">
          <summary className="pressable flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-control px-3 py-2 text-label font-semibold text-accent [&::-webkit-details-marker]:hidden">
            Optional details
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" />
          </summary>
          <div className="grid min-w-0 gap-3 px-3 pb-3 sm:gap-4">
            <TextField label="Explanation" growWithText rows={3} optional {...field('explanation')} />
            <div className="grid min-w-0 gap-3 sm:gap-4 @min-[34rem]/card-form:grid-cols-2">
              <TextField label="Tip to remember" optional {...field('memoryHook')} />
              <TextField label="Source" optional {...field('source')} />
            </div>
          </div>
        </details>
        {bar === null && <DeckWriteProblem state={writeState} />}
        {bar === null && (
          <div className="flex flex-wrap gap-2 sm:gap-3 @min-[34rem]/card-form:justify-end">
            <button
              type="submit"
              className={`${primaryButton} flex-1 basis-32 @min-[34rem]/card-form:flex-none`}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save card'}
            </button>
            <button
              type="button"
              className={`${secondaryButton} flex-1 basis-28 border border-line shadow-none @min-[34rem]/card-form:flex-none`}
              onClick={cancel}
              disabled={saving}
            >
              {card ? 'Cancel' : 'Done'}
            </button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
