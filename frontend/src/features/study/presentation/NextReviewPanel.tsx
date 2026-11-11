type NextReviewPanelProps = {
  label: string;
  when: string;
  note: string;
};

/** The coral-tinted "comes back" panel with a small calendar, on the landing page's sample card. */
export function NextReviewPanel({ label, when, note }: Readonly<NextReviewPanelProps>) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-control bg-highlight-soft p-2 sm:p-3 lg:gap-6 lg:p-6">
      <div className="min-w-0 flex-[1_1_10rem]">
        <p className="text-[0.8125rem] font-bold max-lg:leading-tight lg:text-[1.1875rem]">{label}</p>
        <p className="text-section leading-tight font-extrabold tracking-[-0.01em] lg:text-[2.125rem]">{when}</p>
        <p className="text-[0.8125rem] text-muted max-lg:leading-tight lg:text-[1.0625rem]">{note}</p>
      </div>
      <CalendarArt />
    </div>
  );
}

// Twelve day squares in a 4 by 3 grid; the eighth is the highlighted review day.
const CALENDAR_DAYS = Array.from({ length: 12 }, (_, day) => ({
  x: 14 + (day % 4) * 16,
  y: 34 + Math.floor(day / 4) * 13,
  isReviewDay: day === 7,
}));

function CalendarArt() {
  return (
    <svg aria-hidden="true" viewBox="0 0 88 80" fill="none" className="h-10 w-11 shrink-0 lg:h-20 lg:w-22">
      <rect x="3" y="9" width="82" height="68" rx="10" className="fill-surface stroke-ink" strokeWidth="3" />
      <path d="M3 25h82M24 3v12M64 3v12" className="stroke-ink" strokeWidth="3" strokeLinecap="round" />
      {CALENDAR_DAYS.map((day) => (
        <rect
          key={`${day.x}-${day.y}`}
          x={day.x}
          y={day.y}
          width="12"
          height="9"
          rx="2"
          className={day.isReviewDay ? 'fill-highlight stroke-ink' : 'fill-line'}
          strokeWidth={day.isReviewDay ? 1.5 : 0}
        />
      ))}
    </svg>
  );
}
