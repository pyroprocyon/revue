/** The two-card heart mark, shared by the app header and browser favicon. */
export function BrandMark({ className = 'size-8' }: { className?: string }) {
  return <img src="/favicon.svg" alt="" aria-hidden="true" width={32} height={32} className={className} />;
}
