import { Search, X } from 'lucide-react';
import { useRef, type RefObject } from 'react';

type CollectionSearchProps = {
  label: string;
  placeholder: string;
  clearLabel: string;
  value: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
};

export function CollectionSearch({
  label,
  placeholder,
  clearLabel,
  value,
  onChange,
  inputRef,
}: Readonly<CollectionSearchProps>) {
  const ownInput = useRef<HTMLInputElement>(null);
  const input = inputRef ?? ownInput;
  return (
    <div className="relative mb-3 w-full">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-[14px] size-[16px] -translate-y-1/2 text-muted"
      />
      <input
        ref={input}
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`min-h-[48px] w-full rounded-control border border-field-edge bg-surface py-2 pl-[40px] text-body text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-search-cancel-button]:hidden ${value ? 'pr-[56px]' : 'pr-3'}`}
      />
      {value && (
        <button
          type="button"
          aria-label={clearLabel}
          className="pressable absolute top-0 right-0 grid h-full min-w-[48px] place-items-center rounded-control text-muted"
          onClick={() => {
            onChange('');
            input.current?.focus();
          }}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  );
}
