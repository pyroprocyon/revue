import { CircleAlert } from 'lucide-react';
import { useId } from 'react';

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  rows?: number;
  growWithText?: boolean;
  optional?: boolean;
  note?: string;
  nearLimitNote?: string;
  placeholder?: string;
  error?: string | null;
};

const fieldStyle =
  'mt-1 block min-h-12 w-full rounded-control border border-field-edge bg-field py-2 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:mt-2 sm:py-3';
export const textFieldStyle = `${fieldStyle} px-3`;
const invalidFieldStyle = 'border-missed bg-highlight-soft/40';
const NEAR_LIMIT_SHARE = 0.9;

export function TextField({
  label,
  value,
  onChange,
  maxLength,
  rows,
  growWithText = false,
  optional,
  note,
  nearLimitNote,
  placeholder,
  error,
}: Readonly<TextFieldProps>) {
  const fieldId = useId();
  const noteId = useId();
  const limitId = useId();
  const errorId = useId();
  const controlStyle = `${fieldStyle} ${growWithText ? 'px-[min(0.75rem,12px)]' : 'px-3'} ${error ? invalidFieldStyle : ''}`;
  const nearLimit = value.length >= maxLength * NEAR_LIMIT_SHARE;
  const describedBy = [error && errorId, note && noteId, nearLimit && limitId].filter(Boolean).join(' ');
  const shared = {
    id: fieldId,
    value,
    maxLength,
    required: !optional,
    placeholder,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined,
  };
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <label htmlFor={fieldId} className="text-label font-semibold">
          {label}
        </label>
        {note && (
          <span id={noteId} className="text-support text-muted">
            {note}
          </span>
        )}
      </div>
      {rows === undefined ? (
        <input {...shared} type="text" className={controlStyle} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)]">
          {growWithText && (
            <span
              aria-hidden="true"
              data-text={(value || placeholder || '') + '\u200b'}
              className={`${controlStyle} invisible col-start-1 row-start-1 whitespace-pre-wrap wrap-anywhere after:content-[attr(data-text)]`}
            />
          )}
          <textarea
            {...shared}
            rows={rows}
            className={`${controlStyle} col-start-1 row-start-1 ${growWithText ? 'resize-none' : 'resize-y'}`}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 flex items-start gap-1.5 text-support font-semibold text-missed">
          <CircleAlert aria-hidden="true" className="mt-[0.2em] size-4 shrink-0" />
          {error}
        </p>
      )}
      {nearLimit && (
        <p id={limitId} className="mt-1 text-support text-muted">
          {value.length.toLocaleString('en-US')} of {maxLength.toLocaleString('en-US')} characters
          {nearLimitNote && `. ${nearLimitNote}`}
        </p>
      )}
    </div>
  );
}
