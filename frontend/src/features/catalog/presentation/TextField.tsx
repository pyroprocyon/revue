import { useId } from 'react';

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  rows?: number;
  optional?: boolean;
  note?: string;
  nearLimitNote?: string;
  placeholder?: string;
};

const fieldStyle =
  'mt-1 block min-h-12 w-full rounded-control border border-field-edge bg-field px-3 py-2 text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:mt-2 sm:py-3';
const NEAR_LIMIT_SHARE = 0.9;

export function TextField({
  label,
  value,
  onChange,
  maxLength,
  rows,
  optional,
  note,
  nearLimitNote,
  placeholder,
}: Readonly<TextFieldProps>) {
  const fieldId = useId();
  const noteId = useId();
  const limitId = useId();
  const nearLimit = value.length >= maxLength * NEAR_LIMIT_SHARE;
  const describedBy = [note && noteId, nearLimit && limitId].filter(Boolean).join(' ');
  const shared = {
    id: fieldId,
    value,
    maxLength,
    required: !optional,
    placeholder,
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
        <input {...shared} type="text" className={fieldStyle} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <textarea
          {...shared}
          rows={rows}
          className={`${fieldStyle} resize-y`}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {nearLimit && (
        <p id={limitId} className="mt-1 text-support text-muted">
          {value.length} of {maxLength} characters{nearLimitNote && `. ${nearLimitNote}`}
        </p>
      )}
    </div>
  );
}
