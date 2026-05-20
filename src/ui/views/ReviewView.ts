import BetterRecallPlugin from 'src/main';
import { SpacedRepetitionItem } from 'src/spaced-repetition';
import { PerformanceResponse } from 'src/spaced-repetition/anki';
import { RecallView } from '.';
import { RecallSubView } from './SubView';
import { Deck } from 'src/data/deck';
import {
  BUTTONS_BAR_CLASS,
  REVIEW_CARD_CONTENT,
  REVIEW_CARD_DIVIDER,
} from '../classes';
import {
  ButtonComponent,
  Component,
  getIcon,
  MarkdownRenderer,
} from 'obsidian';
import { formatTimeDifference } from 'src/util';

enum ReviewState {
  ONGOING,
  FINISHED,
}

export class ReviewView extends RecallSubView {
  private rootEl: HTMLElement;
  private contentEl: HTMLElement;
  private vaultRootPath: string;

  private answerButtonsBarEl: HTMLElement;
  private recallButtonsBarEl: HTMLElement | undefined;

  private cardFrontEl: HTMLElement;
  private dividerEl: HTMLElement;
  private cardBackEl: HTMLElement;
  private editButtonContainerEl: HTMLElement;
  private editButton: ButtonComponent;
  private showAnswerButton: ButtonComponent;
  private remainingCountEl: HTMLElement;
  private previousCardButton: ButtonComponent;
  private nextCardButton: ButtonComponent;
  private randomizeButton: ButtonComponent;

  private currentItem: SpacedRepetitionItem | null = null;
  private deck: Deck;
  private state: ReviewState;
  private shouldResumeFromCardEditor = false;
  private resumeWithRecallButtons = false;
  private resumeItemId: string | null = null;
  private sessionItems: SpacedRepetitionItem[] = [];
  private currentSessionIndex = -1;
  private shuffleModeEnabled = true;
  private readonly answeredItemIds = new Set<string>();

  /** Component for MarkdownRenderer; short-lived so it can be unloaded and avoid memory leaks. */
  private readonly markdownComponent = new Component();
  private readonly handleKeyInput = (event: KeyboardEvent): void => {
    if (this.state === ReviewState.FINISHED || !this.answerButtonsBarEl) {
      return;
    }

    const isAnswerButtonsBarVisible = !this.answerButtonsBarEl.hasClass(
      'better-recall--display-none',
    );
    if (isAnswerButtonsBarVisible) {
      if (event.key === ' ') {
        this.showRecallButtons();
      }
    } else {
      if (event.key === '1') {
        void this.handleResponse(PerformanceResponse.AGAIN);
      } else if (event.key === '2') {
        void this.handleResponse(PerformanceResponse.HARD);
      } else if (event.key === '3') {
        void this.handleResponse(PerformanceResponse.GOOD);
      } else if (event.key === '4') {
        void this.handleResponse(PerformanceResponse.EASY);
      }
    }
  };
  private readonly handleInternalLinkClick = (event: MouseEvent): void => {
    event.preventDefault();
    const href = (event.target as HTMLAnchorElement).getAttribute('data-href');
    if (href) {
      void this.plugin.app.workspace.openLinkText(
        href,
        this.vaultRootPath,
        true,
      );
    }
  };

  constructor(
    protected readonly plugin: BetterRecallPlugin,
    protected readonly recallView: RecallView,
  ) {
    super(plugin, recallView);
    this.vaultRootPath = plugin.app.vault.getRoot().path;
    this.recallView.addChild(this.markdownComponent);
  }

  public async setDeck(deck: Deck): Promise<void> {
    // Reload the deck from file to get the latest data
    await this.plugin.decksManager.reloadDeck(deck.id);
    this.deck = this.plugin.decksManager.getDecks()[deck.id];
    // Resets all the items for the algorithm to not have duplicated entries
    // when restarting the recall view.
    this.plugin.algorithm.resetItems();
    this.deck.cardsArray.forEach((card) => this.plugin.algorithm.addItem(card));
    // Starts new session with the items added before.
    this.plugin.algorithm.startNewSession();
    if (this.shuffleModeEnabled) {
      this.plugin.algorithm.shuffleQueuedItems();
    }
    this.sessionItems = [];
    this.currentSessionIndex = -1;
    this.answeredItemIds.clear();
    this.state = ReviewState.ONGOING;
  }

  public render(): void {
    this.rootEl = this.recallView.rootEl.createDiv('better-recall-recall-view');
    activeDocument.addEventListener('keypress', this.handleKeyInput);
    this.renderBackButton(this.rootEl);
    if (!this.deck) {
      this.rootEl.createEl('p', {
        text: 'Review session could not be restored. Please start the review again.',
      });
      return;
    }
    this.renderSessionControls();

    this.contentEl = this.rootEl.createDiv(
      'better-recall-card better-recall-review-card',
    );

    this.editButtonContainerEl = this.contentEl.createDiv(
      'better-recall-review-card__edit-container better-recall--display-none',
    );
    this.editButton = new ButtonComponent(this.editButtonContainerEl);
    this.editButton.buttonEl.addClass('better-recall-review-card__edit-button');
    this.editButton.setButtonText('✏️ edit');
    this.editButton.onClick(() => {
      if (this.currentItem) {
        this.markForCardEditorReturn();
        this.recallView.openCardEditorView(
          this.deck,
          this.currentItem,
          'review',
        );
      }
    });

    this.cardFrontEl = this.contentEl.createEl('h3', {
      cls: REVIEW_CARD_CONTENT,
    });
    this.dividerEl = this.contentEl.createDiv(REVIEW_CARD_DIVIDER);
    this.cardBackEl = this.contentEl.createEl('h3', {
      cls: REVIEW_CARD_CONTENT,
    });

    this.renderAnswerButtons();
    if (this.shouldResumeFromCardEditor && this.state === ReviewState.ONGOING) {
      if (this.tryResumeAfterCardEditor()) {
        return;
      }
      this.clearCardEditorResumeState();
    }
    this.showNextItem();
  }

  private markForCardEditorReturn(): void {
    this.shouldResumeFromCardEditor = true;
    this.resumeWithRecallButtons = this.isAnswerRevealed();
    this.resumeItemId = this.currentItem?.id ?? null;
  }

  public prepareResumeFromCardEditor(): void {
    if (!this.resumeItemId || !this.deck) {
      return;
    }
    const latestDeck = this.plugin.decksManager.getDecks()[this.deck.id];
    if (!latestDeck) {
      return;
    }
    this.deck = latestDeck;
    const latestItem = latestDeck.cards[this.resumeItemId];
    if (latestItem) {
      this.currentItem = latestItem;
      const sessionIndex = this.sessionItems.findIndex(
        (item) => item.id === this.resumeItemId,
      );
      if (sessionIndex >= 0) {
        this.currentSessionIndex = sessionIndex;
        this.sessionItems[sessionIndex] = latestItem;
      } else if (this.currentSessionIndex >= 0) {
        this.sessionItems[this.currentSessionIndex] = latestItem;
      }
      this.plugin.algorithm.replaceItem(latestItem);
    }
  }

  private tryResumeAfterCardEditor(): boolean {
    const itemId = this.resumeItemId;
    if (!itemId || !this.deck) {
      return false;
    }

    const latestItem = this.deck.cards[itemId];
    if (!latestItem) {
      return false;
    }

    this.currentItem = latestItem;
    const sessionIndex = this.sessionItems.findIndex(
      (item) => item.id === itemId,
    );
    if (sessionIndex >= 0) {
      this.currentSessionIndex = sessionIndex;
      this.sessionItems[sessionIndex] = latestItem;
    }
    this.plugin.algorithm.replaceItem(latestItem);
    // Allow grading again after editing a card that was already answered this session.
    this.answeredItemIds.delete(itemId);

    if (this.resumeWithRecallButtons) {
      this.renderCurrentItem(latestItem);
      this.updateSessionControls();
      this.showRecallButtons();
    } else {
      this.showCurrentItemQuestion();
    }

    this.clearCardEditorResumeState();
    return true;
  }

  private clearCardEditorResumeState(): void {
    this.shouldResumeFromCardEditor = false;
    this.resumeWithRecallButtons = false;
    this.resumeItemId = null;
  }

  private isAnswerRevealed(): boolean {
    return (
      Boolean(this.recallButtonsBarEl?.isConnected) &&
      Boolean(this.answerButtonsBarEl?.hasClass('better-recall--display-none'))
    );
  }

  private clearRecallButtonsBar(): void {
    if (this.recallButtonsBarEl) {
      this.recallButtonsBarEl.remove();
      this.recallButtonsBarEl = undefined;
    }
  }

  private renderSessionControls(): void {
    const controlsEl = this.rootEl.createDiv(
      'better-recall-review-session-controls',
    );
    this.remainingCountEl = controlsEl.createDiv(
      'better-recall-review-card__remaining-count',
    );

    const navigationEl = controlsEl.createDiv(
      'better-recall-review-card__navigation',
    );
    this.previousCardButton = new ButtonComponent(navigationEl)
      .setButtonText('←')
      .setTooltip('Previous card')
      .onClick(() => this.showPreviousItem());
    this.randomizeButton = new ButtonComponent(navigationEl)
      .setTooltip('Shuffle mode')
      .onClick(() => this.toggleShuffleMode());
    const shuffleIcon = getIcon('shuffle');
    if (shuffleIcon) {
      this.randomizeButton.buttonEl.appendChild(shuffleIcon);
    } else {
      this.randomizeButton.setButtonText('Shuffle');
    }
    this.randomizeButton.buttonEl.addClass(
      'better-recall-review-card__shuffle-button',
    );
    this.nextCardButton = new ButtonComponent(navigationEl)
      .setButtonText('→')
      .setTooltip('Next viewed card')
      .onClick(() => this.showNextItem());
  }

  private renderAnswerButtons(): void {
    this.answerButtonsBarEl = this.rootEl.createDiv(
      `${BUTTONS_BAR_CLASS} better-recall-review-card__answer-buttons-bar`,
    );

    this.showAnswerButton = new ButtonComponent(
      this.answerButtonsBarEl,
    ).setCta();
    const showAnswerEmojiEl = this.showAnswerButton.buttonEl.createSpan();
    const showAnswerTextEl = this.showAnswerButton.buttonEl.createSpan();
    showAnswerEmojiEl.setText('👀');
    showAnswerTextEl.setText('Show answer');
    this.showAnswerButton.onClick(() => this.showRecallButtons());
  }

  private renderRecallButtons(): void {
    if (!this.currentItem) {
      return;
    }
    this.recallButtonsBarEl = this.rootEl.createDiv(
      `${BUTTONS_BAR_CLASS} better-recall-review-card__answer-buttons-bar`,
    );

    this.renderButton(PerformanceResponse.AGAIN, '❌', 'Again');

    this.renderButton(PerformanceResponse.HARD, '😰', 'Hard');

    this.renderButton(PerformanceResponse.GOOD, '😬', 'Good');

    this.renderButton(PerformanceResponse.EASY, '👑', 'Easy');
  }

  private renderReviewedCardButtons(): void {
    this.clearRecallButtonsBar();
    this.recallButtonsBarEl = this.rootEl.createDiv(
      `${BUTTONS_BAR_CLASS} better-recall-review-card__answer-buttons-bar`,
    );
    new ButtonComponent(this.recallButtonsBarEl)
      .setButtonText('Reviewed')
      .setDisabled(true);
  }

  private renderButton(
    performanceResponse: PerformanceResponse,
    emoji: string,
    text: string,
  ): void {
    if (!this.currentItem || !this.recallButtonsBarEl) {
      return;
    }

    const button = new ButtonComponent(this.recallButtonsBarEl);
    const emojiEl = button.buttonEl.createSpan();
    const textEl = button.buttonEl.createSpan();
    const timeEl = button.buttonEl.createSpan(
      'better-recall-review-card__time',
    );
    emojiEl.setText(emoji);
    textEl.setText(text);

    const nextReviewDate =
      this.plugin.algorithm.calculatePotentialNextReviewDate(
        this.currentItem,
        performanceResponse,
      );
    timeEl.setText(formatTimeDifference(nextReviewDate));
    button.onClick(() => void this.handleResponse(performanceResponse));
  }

  private showRecallButtons(): void {
    this.clearRecallButtonsBar();
    this.cardFrontEl.addClass('better-recall--display-none');
    this.cardFrontEl.hide();
    this.cardBackEl.removeClass('better-recall--display-none');
    this.cardBackEl.show();
    this.dividerEl.addClass('better-recall--display-none');
    this.dividerEl.hide();
    this.editButtonContainerEl.removeClass('better-recall--display-none');
    this.answerButtonsBarEl.addClass('better-recall--display-none');
    if (this.isCurrentItemAnswered()) {
      this.renderReviewedCardButtons();
      return;
    }
    this.renderRecallButtons();
  }

  private showNextItem(): void {
    this.clearRecallButtonsBar();

    this.answerButtonsBarEl.removeClass('better-recall--display-none');
    this.showAnswerButton.buttonEl.show();
    this.cardFrontEl.removeClass('better-recall--display-none');
    this.cardFrontEl.show();

    if (this.currentSessionIndex < this.sessionItems.length - 1) {
      this.currentSessionIndex += 1;
      this.currentItem = this.sessionItems[this.currentSessionIndex];
    } else {
      this.currentItem = this.plugin.algorithm.getNextReviewItem();
      if (this.currentItem) {
        this.sessionItems.push(this.currentItem);
        this.currentSessionIndex = this.sessionItems.length - 1;
      }
    }

    this.editButtonContainerEl.addClass('better-recall--display-none');
    this.dividerEl.addClass('better-recall--display-none');
    this.dividerEl.hide();
    this.cardBackEl.addClass('better-recall--display-none');
    this.cardBackEl.hide();
    if (this.currentItem) {
      this.renderCurrentItem(this.currentItem);
      this.updateSessionControls();
    } else {
      this.cardFrontEl.setText('Review session complete 🚀!');
      this.showAnswerButton.buttonEl.hide();
      this.state = ReviewState.FINISHED;
      this.updateSessionControls();
    }
  }

  private showPreviousItem(): void {
    if (this.currentSessionIndex <= 0) {
      return;
    }
    this.currentSessionIndex -= 1;
    this.currentItem = this.sessionItems[this.currentSessionIndex];
    this.showCurrentItemQuestion();
  }

  private showCurrentItemQuestion(): void {
    this.clearRecallButtonsBar();
    this.answerButtonsBarEl.removeClass('better-recall--display-none');
    this.showAnswerButton.buttonEl.show();
    this.editButtonContainerEl.addClass('better-recall--display-none');
    this.cardFrontEl.removeClass('better-recall--display-none');
    this.cardFrontEl.show();
    this.dividerEl.addClass('better-recall--display-none');
    this.dividerEl.hide();
    this.cardBackEl.addClass('better-recall--display-none');
    this.cardBackEl.hide();
    if (this.currentItem) {
      this.renderCurrentItem(this.currentItem);
    }
    this.updateSessionControls();
  }

  private toggleShuffleMode(): void {
    this.shuffleModeEnabled = !this.shuffleModeEnabled;
    if (this.shuffleModeEnabled) {
      this.plugin.algorithm.shuffleQueuedItems();
    }
    this.updateSessionControls();
  }

  private updateSessionControls(): void {
    const remainingCount = this.getRemainingReviewCount();
    const shuffleLabel = this.shuffleModeEnabled ? ' (shuffled)' : '';
    this.remainingCountEl.setText(`${remainingCount} remaining${shuffleLabel}`);
    this.previousCardButton.setDisabled(this.currentSessionIndex <= 0);
    this.nextCardButton.setDisabled(
      this.currentSessionIndex >= this.sessionItems.length - 1,
    );
    this.randomizeButton.buttonEl.toggleClass(
      'is-active',
      this.shuffleModeEnabled,
    );
    this.randomizeButton.buttonEl.setAttr(
      'aria-pressed',
      String(this.shuffleModeEnabled),
    );
  }

  private getRemainingReviewCount(): number {
    const unreviewedViewedItems = this.sessionItems.filter(
      (item) => !this.answeredItemIds.has(item.id),
    ).length;
    return unreviewedViewedItems + this.plugin.algorithm.getQueuedItemCount();
  }

  private isCurrentItemAnswered(): boolean {
    return Boolean(
      this.currentItem && this.answeredItemIds.has(this.currentItem.id),
    );
  }

  private renderCurrentItem(item: SpacedRepetitionItem): void {
    // Need to empty the elements because `MarkdownRenderer` will always append
    // the markdown to the elements.
    this.cardFrontEl.empty();
    this.cardBackEl.empty();

    void MarkdownRenderer.render(
      this.plugin.app,
      item.content.front,
      this.cardFrontEl,
      this.vaultRootPath,
      this.markdownComponent,
    );
    void MarkdownRenderer.render(
      this.plugin.app,
      item.content.back,
      this.cardBackEl,
      this.vaultRootPath,
      this.markdownComponent,
    );

    // TODO: Check why event listeners are deactivated for internal links.
    this.cardFrontEl.querySelectorAll('a.internal-link').forEach((link) => {
      link.addEventListener('click', this.handleInternalLinkClick);
    });
    this.cardBackEl.querySelectorAll('a.internal-link').forEach((link) => {
      link.addEventListener('click', this.handleInternalLinkClick);
    });
  }

  private async handleResponse(response: PerformanceResponse): Promise<void> {
    if (this.currentItem && !this.isCurrentItemAnswered()) {
      this.plugin.algorithm.updateItemAfterReview(this.currentItem, response);
      // Update the card in the deck
      this.deck.cards[this.currentItem.id] = this.currentItem;
      this.answeredItemIds.add(this.currentItem.id);
      if (this.shuffleModeEnabled) {
        this.plugin.algorithm.shuffleQueuedItems();
      }
      // Save the deck to file
      await this.plugin.decksManager.saveDeckToFile(this.deck.id);
      this.showNextItem();
    }
  }

  public onClose(): void {
    super.onClose();
    activeDocument.removeEventListener('keypress', this.handleKeyInput);
    this.cardFrontEl?.querySelectorAll('a.internal-link').forEach((link) => {
      link.removeEventListener('click', this.handleInternalLinkClick);
    });
    this.cardBackEl?.querySelectorAll('a.internal-link').forEach((link) => {
      link.removeEventListener('click', this.handleInternalLinkClick);
    });
    // Cards are saved immediately after each review, so no need to save here
  }
}
