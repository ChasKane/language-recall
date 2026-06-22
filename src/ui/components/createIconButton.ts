import { getIcon, setTooltip } from 'obsidian';
import { ICON_BUTTON } from '../classes';

export interface IconButtonOptions {
  cls?: string;
  icon: string;
  tooltip: string;
  onClick: () => void;
  fallback?: string;
}

/** Icon-only control using the same div + getIcon pattern as deck list buttons. */
export function createIconButton(
  parent: HTMLElement,
  options: IconButtonOptions,
): HTMLElement {
  const el = parent.createDiv(
    [ICON_BUTTON, options.cls].filter(Boolean).join(' '),
  );
  el.setAttr('role', 'button');
  el.setAttr('tabindex', '0');
  setTooltip(el, options.tooltip);

  const iconEl = getIcon(options.icon);
  if (iconEl) {
    el.appendChild(iconEl);
  } else if (options.fallback) {
    el.createSpan({ text: options.fallback });
  }

  el.onClickEvent(options.onClick);
  return el;
}
