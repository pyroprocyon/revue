import { useFirstInput } from '../../../shared/ui/useFirstInput';
import { ChevronDown } from 'lucide-react';
import { useUnsavedDeckForm } from './UnsavedDeckChanges';
import { useContext, useEffect, useId, useRef, useState, type ReactNode, type SubmitEvent } from 'react';
import { createPortal } from 'react-dom';
import { CardScreenBar } from './CardScreen';
import { draftChanged, draftOf } from './cardDraft';
import { CARD_FIELD_MAX_LENGTH, type CardDraft, type DeckCard } from '../application/decks';
import { DeckWriteProblem } from './DeckWriteProblem';
import type { DeckWriteState } from './useDecks';
import { TextField } from './TextField';
import { primaryButton, secondaryButton } from '../../../shared/ui/buttonStyles';
import { useFocusOnMount } from '../../../shared/ui/useFocusOnMount';

const barButton =
  'w-24 shrink-0 border @max-[21rem]/workspace:w-22 @max-[21rem]/workspace:px-2 @max-[17rem]/workspace:flex-1 @max-[17rem]/workspace:px-1';

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
    const element = form.current;
    if (!element) return;
    const { top } = element.getBoundingClientRect();
    const topIsOnScreen = top >= 0 && top < window.innerHeight;
    if (!topIsOnScreen) element.scrollIntoView({ block: 'nearest', behavior: 'instant' });
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
                className={`${secondaryButton} ${barButton} border-line shadow-none`}
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
                className={`${primaryButton} ${barButton} border-transparent`}
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
        <TextField
          label="Source"
          note="Optional for your own cards"
          placeholder="Book, page or link"
          growWithText
          rows={1}
          optional
          {...field('source')}
        />
        <details open className="group mt-1 border-t border-line pt-1">
          <summary className="pressable -mx-2 flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-control px-2 text-label font-semibold text-accent [&::-webkit-details-marker]:hidden">
            Optional details
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" />
          </summary>
          <div className="grid min-w-0 gap-2.5 pb-1 sm:gap-4">
            <TextField label="Explanation" growWithText rows={3} optional {...field('explanation')} />
            <TextField label="Tip to remember" optional {...field('memoryHook')} />
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
