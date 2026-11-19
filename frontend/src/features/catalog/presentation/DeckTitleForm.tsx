import { useFirstInput } from '../../../shared/ui/useFirstInput';
import { useUnsavedDeckForm } from './UnsavedDeckChanges';
import type { ReactNode, SubmitEvent } from 'react';
import { DECK_TITLE_MAX_LENGTH } from '../application/decks';
import { TextField } from './TextField';
import { primaryButton, secondaryButton } from '../../../shared/ui/buttonStyles';

type DeckTitleFormProps = {
  title: string;
  onTitleChange: (title: string) => void;
  initialTitle?: string;
  saveLabel: string;
  savingLabel?: string;
  note?: string;
  placeholder?: string;
  saving: boolean;
  problem: ReactNode;
  prepareWrite: () => void;
  onSave: (title: string, saved: () => void) => void;
  onCancel?: () => void;
  saveOnlyWhenChanged?: boolean;
};

export function DeckTitleForm({
  title,
  onTitleChange,
  initialTitle = '',
  saveLabel,
  savingLabel = 'Saving…',
  note,
  placeholder,
  saving,
  problem,
  prepareWrite,
  onSave,
  onCancel,
  saveOnlyWhenChanged = false,
}: Readonly<DeckTitleFormProps>) {
  const firstInput = useFirstInput(prepareWrite);
  const titleTooLong = title.length > DECK_TITLE_MAX_LENGTH;

  const guard = useUnsavedDeckForm(title !== initialTitle);
  const sharedRow = onCancel ? 'flex-1 basis-32' : '';

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!titleTooLong) onSave(title, guard.saved);
  }

  return (
    <form onInput={firstInput} onSubmit={submit} aria-busy={saving} className="grid gap-4">
      <fieldset disabled={saving} className="grid min-w-0 gap-4">
        <TextField
          label="Name"
          note={note}
          placeholder={placeholder}
          value={title}
          onChange={onTitleChange}
          maxLength={DECK_TITLE_MAX_LENGTH}
        />
        {titleTooLong && (
          <p className="text-support text-muted">Shorten the name to {DECK_TITLE_MAX_LENGTH} characters to save it.</p>
        )}
        {problem}
        <div className="flex flex-wrap gap-3 empty:hidden">
          {(!saveOnlyWhenChanged || title !== initialTitle) && (
            <button type="submit" className={`${primaryButton} ${sharedRow}`} disabled={saving || titleTooLong}>
              {saving ? savingLabel : saveLabel}
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              className={`${secondaryButton} ${sharedRow} border border-line shadow-none`}
              onClick={() => guard.cancel(onCancel)}
              disabled={saving}
            >
              Cancel
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
