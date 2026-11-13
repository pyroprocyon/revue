import { secondaryButton } from './buttonStyles';

type PageControlsProps = {
  label: string;
  onPrevious?: () => void;
  onNext?: () => void;
};

const pageButton = `${secondaryButton} disabled:bg-subtle disabled:text-muted disabled:shadow-none`;

export function PageControls({ label, onPrevious, onNext }: Readonly<PageControlsProps>) {
  return (
    <nav aria-label={label} className="mt-6 flex flex-wrap justify-between gap-3">
      <button type="button" className={pageButton} onClick={onPrevious} disabled={!onPrevious}>Previous</button>
      <button type="button" className={pageButton} onClick={onNext} disabled={!onNext}>Next</button>
    </nav>
  );
}
