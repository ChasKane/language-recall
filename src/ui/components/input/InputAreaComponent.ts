import { TextAreaComponent } from 'obsidian';
import { KeyboardListener } from './KeyboardListener';
import { createDescriptionEl } from './utils';

interface InputAreaComponentOptions {
  description?: string;
  preserveScrollOnFocus?: boolean;
  ensureVisibleOnFocus?: boolean;
}

export class InputAreaComponent extends TextAreaComponent {
  public descriptionEl: HTMLElement;

  public keyboardListener: KeyboardListener;
  private scrollContainer: HTMLElement | null = null;
  private lastScrollTop = 0;
  private lastWindowScrollTop = 0;
  private isPreservingFocusedScroll = false;
  private readonly focusGuardAbortController = new AbortController();

  constructor(
    private contentEl: HTMLElement,
    private options?: InputAreaComponentOptions,
  ) {
    super(contentEl);
    this.inputEl.rows = 5;
    this.inputEl.addClass('better-recall-input-no-resize');
    this.keyboardListener = new KeyboardListener(this.inputEl);
    this.render();
  }

  private render() {
    if (this.options?.description) {
      this.descriptionEl = createDescriptionEl(
        this.contentEl,
        this.inputEl,
        this.options.description,
      );
    }

    this.inputEl.classList.add('better-recall-field');
    this.keyboardListener.addKeyEnterAction();
    if (this.options?.preserveScrollOnFocus) {
      this.setupFocusScrollGuards();
    }
    if (this.options?.ensureVisibleOnFocus) {
      this.setupFocusEnsureVisible();
    }
  }

  public cleanup(): void {
    this.keyboardListener.cleanup();
    this.focusGuardAbortController.abort();
  }

  private setupFocusScrollGuards(): void {
    const signal = this.focusGuardAbortController.signal;
    const windowEl = this.inputEl.ownerDocument.defaultView;
    const visualViewport = windowEl?.visualViewport;

    this.inputEl.addEventListener(
      'focus',
      () => {
        this.rememberScrollPosition();
        this.isPreservingFocusedScroll = true;
        this.scheduleScrollRestore();
      },
      { signal },
    );

    this.inputEl.addEventListener(
      'touchstart',
      (ev) => {
        this.rememberScrollPosition();
        if (ev.cancelable) {
          ev.preventDefault();
        }
        this.inputEl.focus({ preventScroll: true });
        this.isPreservingFocusedScroll = true;
        this.scheduleScrollRestore();
      },
      { passive: false, signal },
    );

    this.inputEl.addEventListener(
      'blur',
      () => {
        this.isPreservingFocusedScroll = false;
      },
      { signal },
    );

    windowEl?.addEventListener(
      'focus',
      () => {
        if (!this.isInputFocused()) {
          return;
        }
        this.scheduleScrollRestore();
      },
      { signal },
    );

    visualViewport?.addEventListener(
      'resize',
      () => {
        if (!this.isInputFocused()) {
          return;
        }
        this.scheduleScrollRestore();
      },
      { signal },
    );

    visualViewport?.addEventListener(
      'scroll',
      () => {
        if (!this.isInputFocused()) {
          return;
        }
        this.scheduleScrollRestore();
      },
      { signal },
    );
  }

  private setupFocusEnsureVisible(): void {
    const signal = this.focusGuardAbortController.signal;
    const windowEl = this.inputEl.ownerDocument.defaultView;
    const visualViewport = windowEl?.visualViewport;

    this.inputEl.addEventListener(
      'focus',
      () => {
        this.scheduleEnsureVisible();
      },
      { signal },
    );

    visualViewport?.addEventListener(
      'resize',
      () => {
        if (this.inputEl.ownerDocument.activeElement !== this.inputEl) {
          return;
        }
        this.scheduleEnsureVisible();
      },
      { signal },
    );
  }

  private rememberScrollPosition(): void {
    this.scrollContainer = this.getScrollContainer();
    if (this.scrollContainer) {
      this.lastScrollTop = this.scrollContainer.scrollTop;
    }
    this.lastWindowScrollTop =
      this.inputEl.ownerDocument.scrollingElement?.scrollTop ??
      this.inputEl.ownerDocument.documentElement.scrollTop ??
      0;
  }

  private restoreScrollPosition(): void {
    if (!this.scrollContainer) {
      this.restoreWindowScroll();
      return;
    }
    this.scrollContainer.scrollTop = this.lastScrollTop;
    this.restoreWindowScroll();
  }

  private getScrollContainer(): HTMLElement | null {
    let current: HTMLElement | null = this.inputEl.parentElement;
    while (current) {
      if (current.scrollHeight > current.clientHeight) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  private isInputFocused(): boolean {
    return (
      this.isPreservingFocusedScroll &&
      this.inputEl.ownerDocument.activeElement === this.inputEl
    );
  }

  private restoreWindowScroll(): void {
    const windowEl = this.inputEl.ownerDocument.defaultView;
    const scrollingElement = this.inputEl.ownerDocument.scrollingElement;
    if (scrollingElement) {
      scrollingElement.scrollTop = this.lastWindowScrollTop;
    }
    windowEl?.scrollTo({
      top: this.lastWindowScrollTop,
      behavior: 'auto',
    });
  }

  private scheduleScrollRestore(): void {
    const windowEl = this.inputEl.ownerDocument.defaultView;
    if (!windowEl) {
      this.restoreScrollPosition();
      return;
    }
    const runRestore = () => {
      if (!this.isInputFocused()) {
        return;
      }
      this.restoreScrollPosition();
    };
    windowEl.requestAnimationFrame(runRestore);
    windowEl.setTimeout(runRestore, 50);
    windowEl.setTimeout(runRestore, 150);
  }

  private scheduleEnsureVisible(): void {
    const windowEl = this.inputEl.ownerDocument.defaultView;
    if (!windowEl) {
      this.ensureVisible();
      return;
    }
    const runEnsureVisible = () => {
      if (this.inputEl.ownerDocument.activeElement !== this.inputEl) {
        return;
      }
      this.ensureVisible();
    };
    windowEl.requestAnimationFrame(runEnsureVisible);
    windowEl.setTimeout(runEnsureVisible, 100);
    windowEl.setTimeout(runEnsureVisible, 250);
  }

  private ensureVisible(): void {
    this.inputEl.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: 'auto',
    });
  }
}
