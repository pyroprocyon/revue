/** Inline so a newly mounted header never waits for image loading or decoding. */
export function BrandMark({ className = 'size-8' }: Readonly<{ className?: string }>) {
  // BrandMark.test.tsx keeps this geometry in sync with public/favicon.svg.
  return (
    <svg aria-hidden="true" focusable="false" width={32} height={32} viewBox="0 0 36 36" className={className}>
      <rect x="12.9749" y="6.9185" width="15" height="22" rx="3.5" fill="#ff7676" transform="rotate(45 20.4749 17.9185)" />
      <rect x="8.0251" y="6.9185" width="15" height="22" rx="3.5" fill="#3730a3" transform="rotate(-45 15.5251 17.9185)" />
    </svg>
  );
}
