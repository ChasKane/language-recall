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
  Notice,
  setTooltip,
} from 'obsidian';
import { formatTimeDifference } from 'src/util';
import { CardEditProposal, GeminiChatMessage } from 'src/util/gemini';

enum ReviewState {
  ONGOING,
  FINISHED,
}

export class ReviewView extends RecallSubView {
  private rootEl: HTMLElement;
  private contentEl: HTMLElement;
  private vaultRootPath: string;

  private answerButtonsBarEl: HTMLElement;
  private answerRevealed = false;

  private cardFrontEl: HTMLElement;
  private dividerEl: HTMLElement;
  private cardBackEl: HTMLElement;
  private editButtonContainerEl: HTMLElement;
  private editButton: ButtonComponent;
  private followupButtonEl: HTMLElement | null = null;
  private flipSideButton: ButtonComponent;
  private showAnswerButton: ButtonComponent;
  private showingBack = false;
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
  private readonly followupConversations = new Map<
    string,
    GeminiChatMessage[]
  >();
  private shouldResumeFromFollowup = false;
  private followupResumeWithRecallButtons = false;
  private followupResumeItemId: string | null = null;

  /** Component for MarkdownRenderer; short-lived so it can be unloaded and avoid memory leaks. */
  private readonly markdownComponent = new Component();
  private readonly handleKeyInput = (event: KeyboardEvent): void => {
    if (this.state === ReviewState.FINISHED || !this.answerButtonsBarEl) {
      return;
    }

    if (!this.answerRevealed) {
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

  /**
   * Prepares a review session from the in-memory deck (instant UI).
   */
  public prepareDeck(deckId: string): void {
    const deck = this.plugin.decksManager.getDecks()[deckId];
    if (!deck) {
      throw new Error(`Deck not found: ${deckId}`);
    }
    this.applyDeckSession(deck);
  }

  /**
   * Reloads deck data from disk without resetting the active review session.
   */
  public async syncDeckFromFile(deckId: string): Promise<void> {
    await this.plugin.decksManager.reloadDeck(deckId);
    const deck = this.plugin.decksManager.getDecks()[deckId];
    if (!deck) {
      throw new Error(`Deck not found after reload: ${deckId}`);
    }
    this.deck = deck;

    if (this.currentItem) {
      const updatedCurrent = deck.cards[this.currentItem.id];
      if (updatedCurrent) {
        this.currentItem = updatedCurrent;
      }
    }

    this.sessionItems = this.sessionItems.map(
      (item) => deck.cards[item.id] ?? item,
    );

    deck.cardsArray.forEach((card) => {
      this.plugin.algorithm.replaceItem(card);
    });

    if (
      this.answerRevealed &&
      this.currentItem &&
      this.answerButtonsBarEl?.isConnected
    ) {
      if (this.isCurrentItemAnswered()) {
        this.renderReviewedCardButtons();
      } else {
        this.renderRecallButtons();
      }
      this.renderCardMarkdown(this.currentItem);
    }
  }

  private applyDeckSession(deck: Deck): void {
    this.deck = deck;
    // Resets all the items for the algorithm to not have duplicated entries
    // when restarting the recall view.
    this.plugin.algorithm.resetItems();
    deck.cardsArray.forEach((card) => this.plugin.algorithm.addItem(card));
    // Starts new session with the items added before.
    this.plugin.algorithm.startNewSession();
    if (this.shuffleModeEnabled) {
      this.plugin.algorithm.shuffleQueuedItems();
    }
    this.sessionItems = [];
    this.currentSessionIndex = -1;
    this.answeredItemIds.clear();
    this.clearFollowupConversations();
    this.state = ReviewState.ONGOING;
  }

  public render(): void {
    this.rootEl = this.recallView.rootEl.createDiv('better-recall-recall-view');
    const keyTarget =
      typeof activeDocument !== 'undefined' ? activeDocument : document;
    keyTarget.removeEventListener('keypress', this.handleKeyInput);
    keyTarget.addEventListener('keypress', this.handleKeyInput);
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
    const cardActionButtonsEl = this.editButtonContainerEl.createDiv(
      'better-recall-review-card__action-buttons',
    );
    this.flipSideButton = new ButtonComponent(cardActionButtonsEl);
    this.flipSideButton.buttonEl.addClass(
      'better-recall-review-card__flip-side-button',
    );
    this.flipSideButton.onClick(() => this.toggleCardSide());
    this.followupButtonEl = cardActionButtonsEl.createDiv(
      'better-recall-review-card__followup-button',
    );
    this.followupButtonEl.setAttr('role', 'button');
    this.followupButtonEl.setAttr('tabindex', '0');
    setTooltip(this.followupButtonEl, 'Ask AI follow-up');
    const followupIcon = getIcon('brain');
    if (followupIcon) {
      this.followupButtonEl.appendChild(followupIcon);
    } else {
      this.followupButtonEl.createSpan({ text: '🧠' });
    }
    this.followupButtonEl.onClickEvent(() => this.openFollowupChat());
    this.editButton = new ButtonComponent(cardActionButtonsEl);
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
    if (this.shouldResumeFromFollowup && this.state === ReviewState.ONGOING) {
      if (this.tryResumeAfterFollowup()) {
        return;
      }
      this.clearFollowupResumeState();
    }
    if (this.shouldResumeFromCardEditor && this.state === ReviewState.ONGOING) {
      if (this.tryResumeAfterCardEditor()) {
        return;
      }
      this.clearCardEditorResumeState();
    }
    this.showNextItem();
  }

  public markForFollowupReturn(): void {
    this.shouldResumeFromFollowup = true;
    this.followupResumeWithRecallButtons = this.isAnswerRevealed();
    this.followupResumeItemId = this.currentItem?.id ?? null;
  }

  public prepareResumeFromFollowup(): void {
    if (!this.followupResumeItemId || !this.deck) {
      return;
    }

    const latestDeck = this.plugin.decksManager.getDecks()[this.deck.id];
    if (!latestDeck) {
      return;
    }

    this.deck = latestDeck;
    const latestItem = latestDeck.cards[this.followupResumeItemId];
    if (!latestItem) {
      return;
    }

    this.currentItem = latestItem;
    const sessionIndex = this.sessionItems.findIndex(
      (item) => item.id === this.followupResumeItemId,
    );
    if (sessionIndex >= 0) {
      this.currentSessionIndex = sessionIndex;
      this.sessionItems[sessionIndex] = latestItem;
    } else if (this.currentSessionIndex >= 0) {
      this.sessionItems[this.currentSessionIndex] = latestItem;
    }
    this.plugin.algorithm.replaceItem(latestItem);
  }

  private tryResumeAfterFollowup(): boolean {
    const itemId = this.followupResumeItemId;
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

    if (this.followupResumeWithRecallButtons) {
      this.renderCurrentItem(latestItem);
      this.updateSessionControls();
      this.showRecallButtons();
    } else {
      this.showCurrentItemQuestion();
    }

    this.clearFollowupResumeState();
    return true;
  }

  private clearFollowupResumeState(): void {
    this.shouldResumeFromFollowup = false;
    this.followupResumeWithRecallButtons = false;
    this.followupResumeItemId = null;
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
    return this.answerRevealed;
  }

  private clearButtonsBar(): void {
    this.answerButtonsBarEl?.empty();
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
    this.renderShowAnswerButton();
  }

  private renderShowAnswerButton(): void {
    this.clearButtonsBar();
    this.answerRevealed = false;

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
    if (!this.currentItem || !this.answerButtonsBarEl) {
      return;
    }
    this.clearButtonsBar();

    this.renderButton(PerformanceResponse.AGAIN, '❌', 'Again');

    this.renderButton(PerformanceResponse.HARD, '😰', 'Hard');

    this.renderButton(PerformanceResponse.GOOD, '😬', 'Good');

    this.renderButton(PerformanceResponse.EASY, '👑', 'Easy');
  }

  private renderReviewedCardButtons(): void {
    this.clearButtonsBar();
    new ButtonComponent(this.answerButtonsBarEl)
      .setButtonText('Reviewed')
      .setDisabled(true);
  }

  private renderButton(
    performanceResponse: PerformanceResponse,
    emoji: string,
    text: string,
  ): void {
    if (!this.currentItem || !this.answerButtonsBarEl) {
      return;
    }

    const button = new ButtonComponent(this.answerButtonsBarEl);
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
    button.onClick((event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.handleResponse(performanceResponse);
    });
  }

  private setCardSideDisplay(showBack: boolean): void {
    this.showingBack = showBack;
    if (showBack) {
      this.cardFrontEl.addClass('better-recall--display-none');
      this.cardFrontEl.hide();
      this.cardBackEl.removeClass('better-recall--display-none');
      this.cardBackEl.show();
    } else {
      this.cardFrontEl.removeClass('better-recall--display-none');
      this.cardFrontEl.show();
      this.cardBackEl.addClass('better-recall--display-none');
      this.cardBackEl.hide();
    }
    this.dividerEl.addClass('better-recall--display-none');
    this.dividerEl.hide();
    this.updateFlipSideButtonLabel();
  }

  private updateFlipSideButtonLabel(): void {
    this.flipSideButton.setButtonText(
      this.showingBack ? 'Show front' : 'Show back',
    );
  }

  private toggleCardSide(): void {
    this.setCardSideDisplay(!this.showingBack);
  }

  private showRecallButtons(): void {
    this.answerRevealed = true;
    this.setCardSideDisplay(true);
    this.editButtonContainerEl.removeClass('better-recall--display-none');
    this.updateFollowupButtonState();
    if (this.isCurrentItemAnswered()) {
      this.renderReviewedCardButtons();
      return;
    }
    this.renderRecallButtons();
  }

  private showNextItem(): void {
    this.renderShowAnswerButton();

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
    this.setCardSideDisplay(false);
    if (this.currentItem) {
      this.renderCurrentItem(this.currentItem);
      this.updateSessionControls();
      this.updateFollowupButtonState();
    } else {
      this.cardFrontEl.setText('Review session complete 🚀!');
      this.clearButtonsBar();
      this.answerRevealed = false;
      this.state = ReviewState.FINISHED;
      this.clearFollowupConversations();
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
    this.renderShowAnswerButton();
    this.editButtonContainerEl.addClass('better-recall--display-none');
    this.setCardSideDisplay(false);
    if (this.currentItem) {
      this.renderCurrentItem(this.currentItem);
    }
    this.updateSessionControls();
    this.updateFollowupButtonState();
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
    this.renderCardMarkdown(item);
  }

  private async handleResponse(response: PerformanceResponse): Promise<void> {
    if (!this.currentItem || this.isCurrentItemAnswered()) {
      return;
    }

    try {
      this.plugin.algorithm.updateItemAfterReview(this.currentItem, response);
      // Update the card in the deck
      this.deck.cards[this.currentItem.id] = this.currentItem;
      if (response === PerformanceResponse.AGAIN) {
        this.answeredItemIds.delete(this.currentItem.id);
      } else {
        this.answeredItemIds.add(this.currentItem.id);
      }
      if (this.shuffleModeEnabled) {
        this.plugin.algorithm.shuffleQueuedItems();
      }
      // Save the deck to file
      await this.plugin.decksManager.saveDeckToFile(this.deck.id);
      this.showNextItem();
    } catch (error) {
      console.error('Failed to save review response:', error);
      new Notice('Could not save review. Please try again.', 5000);
    }
  }

  private openFollowupChat(): void {
    if (!this.currentItem || !this.deck) {
      return;
    }

    const apiKey = this.plugin.getSettings().geminiApiKey;
    if (!apiKey.trim()) {
      new Notice('Add a Gemini API key in language recall settings', 5000);
      return;
    }

    this.recallView.openFollowupView({
      mode: 'review',
      returnTo: 'review',
      deck: this.deck,
      card: this.currentItem,
      getCardContent: () => ({
        front: this.currentItem!.content.front,
        back: this.currentItem!.content.back,
      }),
      initialMessages: this.getFollowupMessages(this.currentItem.id),
      onMessagesChange: (messages) =>
        this.setFollowupMessages(this.currentItem!.id, messages),
      onApplyCardEdit: (edit) => this.applyFollowupCardEdit(edit),
    });
  }

  private getFollowupMessages(cardId: string): GeminiChatMessage[] {
    return this.followupConversations.get(cardId) ?? [];
  }

  private setFollowupMessages(
    cardId: string,
    messages: GeminiChatMessage[],
  ): void {
    if (messages.length === 0) {
      this.followupConversations.delete(cardId);
    } else {
      this.followupConversations.set(cardId, messages);
    }
    this.updateFollowupButtonState();
  }

  private clearFollowupConversations(): void {
    this.followupConversations.clear();
    this.updateFollowupButtonState();
  }

  private updateFollowupButtonState(): void {
    if (!this.currentItem || !this.followupButtonEl) {
      return;
    }
    const hasConversation = this.followupConversations.has(this.currentItem.id);
    this.followupButtonEl.toggleClass('has-conversation', hasConversation);
    setTooltip(
      this.followupButtonEl,
      hasConversation ? 'AI follow-up (saved)' : 'Ask AI follow-up',
    );
  }

  private async applyFollowupCardEdit(
    edit: CardEditProposal,
  ): Promise<CardEditProposal> {
    if (!this.currentItem || !this.deck) {
      throw new Error('No card is being reviewed');
    }

    const updatedCard = {
      ...this.currentItem,
      content: {
        front: edit.front,
        back: edit.back,
      },
    };

    await this.plugin.decksManager.updateCardContent(this.deck.id, updatedCard);
    this.deck.cards[updatedCard.id] = updatedCard;
    this.currentItem = updatedCard;

    const sessionIndex = this.sessionItems.findIndex(
      (item) => item.id === updatedCard.id,
    );
    if (sessionIndex >= 0) {
      this.sessionItems[sessionIndex] = updatedCard;
    }

    this.plugin.algorithm.replaceItem(updatedCard);
    if (this.cardFrontEl?.isConnected && this.cardBackEl?.isConnected) {
      this.renderCardMarkdown(updatedCard);
    }

    return updatedCard.content;
  }

  private renderCardMarkdown(item: SpacedRepetitionItem): void {
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

    this.cardFrontEl.querySelectorAll('a.internal-link').forEach((link) => {
      link.addEventListener('click', this.handleInternalLinkClick);
    });
    this.cardBackEl.querySelectorAll('a.internal-link').forEach((link) => {
      link.addEventListener('click', this.handleInternalLinkClick);
    });
  }

  public onClose(): void {
    super.onClose();
    const keyTarget =
      typeof activeDocument !== 'undefined' ? activeDocument : document;
    keyTarget.removeEventListener('keypress', this.handleKeyInput);
    this.cardFrontEl?.querySelectorAll('a.internal-link').forEach((link) => {
      link.removeEventListener('click', this.handleInternalLinkClick);
    });
    this.cardBackEl?.querySelectorAll('a.internal-link').forEach((link) => {
      link.removeEventListener('click', this.handleInternalLinkClick);
    });
    // Cards are saved immediately after each review, so no need to save here
  }
}
