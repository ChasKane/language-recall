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
import { ButtonComponent, Component, MarkdownRenderer } from 'obsidian';
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
  private recallButtonsBarEl: HTMLElement;

  private cardFrontEl: HTMLElement;
  private dividerEl: HTMLElement;
  private cardBackEl: HTMLElement;
  private editButtonContainerEl: HTMLElement;
  private editButton: ButtonComponent;
  private showAnswerButton: ButtonComponent;

  private currentItem: SpacedRepetitionItem | null = null;
  private deck: Deck;
  private state: ReviewState;
  private shouldResumeFromCardEditor = false;
  private resumeWithRecallButtons = false;
  private resumeItemId: string | null = null;

  /** Component for MarkdownRenderer; short-lived so it can be unloaded and avoid memory leaks. */
  private readonly markdownComponent = new Component();
  private readonly handleKeyInputBound = this.handleKeyInput.bind(this);
  private readonly handleInternalLinkClickBound =
    this.handleInternalLinkClick.bind(this);

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
    this.state = ReviewState.ONGOING;
  }

  private handleKeyInput(event: KeyboardEvent): void {
    if (this.state === ReviewState.FINISHED) {
      return;
    }

    const isAnswerButtonsBarVisible = !this.answerButtonsBarEl.hasClass(
      'better-recall--display-none',
    );
    if (isAnswerButtonsBarVisible) {
      // Key `Space` pressed.
      if (event.key === ' ') {
        this.showRecallButtons();
      }
    } else {
      if (event.key === '1') {
        // Handle again press.
        void this.handleResponse(PerformanceResponse.AGAIN);
      } else if (event.key === '2') {
        // Handle hard press.
        void this.handleResponse(PerformanceResponse.HARD);
      } else if (event.key === '3') {
        // Handle good press.
        void this.handleResponse(PerformanceResponse.GOOD);
      } else if (event.key === '4') {
        // Handle easy press.
        void this.handleResponse(PerformanceResponse.EASY);
      }
    }
  }

  public render(): void {
    this.rootEl = this.recallView.rootEl.createDiv('better-recall-recall-view');
    document.addEventListener('keypress', this.handleKeyInputBound);
    this.renderBackButton(this.rootEl);

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
    this.dividerEl = this.contentEl.createEl('div', {
      cls: REVIEW_CARD_DIVIDER,
    });
    this.cardBackEl = this.contentEl.createEl('h3', {
      cls: REVIEW_CARD_CONTENT,
    });

    this.renderAnswerButtons();
    if (
      this.shouldResumeFromCardEditor &&
      this.state === ReviewState.ONGOING &&
      this.currentItem
    ) {
      this.renderCurrentItem(this.currentItem);
      if (this.resumeWithRecallButtons) {
        this.showRecallButtons();
      }
      this.shouldResumeFromCardEditor = false;
      this.resumeWithRecallButtons = false;
      return;
    }
    this.showNextItem();
  }

  private markForCardEditorReturn(): void {
    this.shouldResumeFromCardEditor = true;
    this.resumeWithRecallButtons = Boolean(
      this.recallButtonsBarEl?.isConnected,
    );
    this.resumeItemId = this.currentItem?.id ?? null;
  }

  public prepareResumeFromCardEditor(): void {
    if (!this.resumeItemId) {
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
    } else {
      // If the edited card was deleted/moved, continue with the next due card.
      this.currentItem = null;
      this.shouldResumeFromCardEditor = false;
      this.resumeWithRecallButtons = false;
    }
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
    this.showAnswerButton.onClick(this.showRecallButtons.bind(this));
  }

  private renderRecallButtons(): void {
    this.recallButtonsBarEl = this.rootEl.createDiv(
      `${BUTTONS_BAR_CLASS} better-recall-review-card__answer-buttons-bar`,
    );

    this.renderButton(PerformanceResponse.AGAIN, '❌', 'Again');

    this.renderButton(PerformanceResponse.HARD, '😰', 'Hard');

    this.renderButton(PerformanceResponse.GOOD, '😬', 'Good');

    this.renderButton(PerformanceResponse.EASY, '👑', 'Easy');
  }

  private renderButton(
    performanceResponse: PerformanceResponse,
    emoji: string,
    text: string,
  ): void {
    if (!this.currentItem) {
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
    this.cardBackEl.removeClass('better-recall--display-none');
    this.dividerEl.removeClass('better-recall--display-none');
    this.editButtonContainerEl.removeClass('better-recall--display-none');
    this.answerButtonsBarEl.addClass('better-recall--display-none');
    this.renderRecallButtons();
  }

  private showNextItem(): void {
    if (this.recallButtonsBarEl) {
      this.recallButtonsBarEl.remove();
    }

    this.answerButtonsBarEl.removeClass('better-recall--display-none');

    this.currentItem = this.plugin.algorithm.getNextReviewItem();

    this.editButtonContainerEl.addClass('better-recall--display-none');
    this.dividerEl.addClass('better-recall--display-none');
    this.cardBackEl.addClass('better-recall--display-none');
    if (this.currentItem) {
      this.renderCurrentItem(this.currentItem);
    } else {
      this.cardFrontEl.setText('Review session complete 🚀!');
      this.showAnswerButton.buttonEl.hide();
      this.state = ReviewState.FINISHED;
    }
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
      link.addEventListener('click', this.handleInternalLinkClickBound);
    });
    this.cardBackEl.querySelectorAll('a.internal-link').forEach((link) => {
      link.addEventListener('click', this.handleInternalLinkClickBound);
    });
  }

  private handleInternalLinkClick(event: MouseEvent): void {
    event.preventDefault();
    const href = (event.target as HTMLAnchorElement).getAttribute('data-href');
    if (href) {
      void this.plugin.app.workspace.openLinkText(
        href,
        this.vaultRootPath,
        true,
      );
    }
  }

  private async handleResponse(response: PerformanceResponse): Promise<void> {
    if (this.currentItem) {
      this.plugin.algorithm.updateItemAfterReview(this.currentItem, response);
      // Update the card in the deck
      this.deck.cards[this.currentItem.id] = this.currentItem;
      // Save the deck to file
      await this.plugin.decksManager.saveDeckToFile(this.deck.id);
      this.showNextItem();
    }
  }

  public onClose(): void {
    super.onClose();
    document.removeEventListener('keypress', this.handleKeyInputBound);
    this.cardFrontEl.querySelectorAll('a.internal-link').forEach((link) => {
      link.removeEventListener('click', this.handleInternalLinkClickBound);
    });
    this.cardBackEl.querySelectorAll('a.internal-link').forEach((link) => {
      link.removeEventListener('click', this.handleInternalLinkClickBound);
    });
    // Cards are saved immediately after each review, so no need to save here
  }
}
