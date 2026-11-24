import { Layers, LayoutGrid } from 'lucide-react';

export function CollectionLayoutSwitch({
  stack,
  onChange,
}: Readonly<{ stack: boolean; onChange: (stack: boolean) => void }>) {
  return (
    <fieldset className="collection-layout ml-auto hidden @min-[64rem]/workspace:flex">
      <legend className="sr-only">Collection layout</legend>
      <button type="button" aria-pressed={!stack} onClick={() => onChange(false)}>
        <LayoutGrid aria-hidden="true" className="size-[18px] shrink-0" />
        Grid
      </button>
      <button type="button" aria-pressed={stack} onClick={() => onChange(true)}>
        <Layers aria-hidden="true" className="size-[18px] shrink-0" />
        Stack
      </button>
    </fieldset>
  );
}
