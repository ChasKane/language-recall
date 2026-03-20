import { ButtonComponent } from 'obsidian';
import BetterRecallPlugin from 'src/main';
import { RecallView } from '.';

export abstract class RecallSubView {
  constructor(
    protected readonly plugin: BetterRecallPlugin,
    protected readonly recallView: RecallView,
  ) {}

  public abstract render(): void;

  protected renderBackButton(parent: HTMLElement, onBack?: () => void): void {
    const backRowEl = parent.createDiv('better-recall-view-back-row');
    const backButton = new ButtonComponent(backRowEl);
    backButton.setButtonText('Back');
    backButton.onClick((ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      (onBack ?? (() => this.recallView.handleBack()))();
    });
    backButton.buttonEl.addClass('better-recall-view-back-button');
  }

  public onClose() {}
}
