import type { CSSProperties } from 'react';

export const twoPanes =
  'mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-start gap-4 @min-[60rem]:grid-cols-[minmax(22rem,26rem)_minmax(0,1fr)] @min-[60rem]:gap-6';
export const onePane = 'mt-2 grid gap-3';
export const cardPaneGutters = 'px-5 @min-[60rem]:px-8';

export const belowToolbar = (toolbarBottom: number | null) =>
  toolbarBottom === null ? undefined : ({ '--deck-toolbar-bottom': `${toolbarBottom}px` } as CSSProperties);

export const paneBelowStickyToolbar =
  'sticky top-[calc(var(--deck-toolbar-bottom)_+_0.5rem)] max-h-[calc(100dvh_-_var(--deck-toolbar-bottom)_-_1.5rem)] min-w-0 overflow-y-auto';
