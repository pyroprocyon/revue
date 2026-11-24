export function watchTouchFocus() {
  const { dataset } = document.documentElement;
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') dataset.touchFocus ??= '';
      else delete dataset.touchFocus;
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (dataset.touchFocus === undefined || event.isComposing) return;
      const target = event.target;
      const editingText =
        target instanceof HTMLElement &&
        (target.isContentEditable || target.matches('input:not([type=radio], [type=checkbox]), textarea'));
      if (!editingText || event.key === 'Tab' || event.key === 'Escape') delete dataset.touchFocus;
    },
    true,
  );
}
