import { RecallSubView } from './SubView';
import BetterRecallPlugin from 'src/main';
import { RecallView } from '.';
import { Deck } from 'src/data/deck';
import { ButtonsBarComponent as ButtonsBar } from '../components/ButtonsBarComponent';
import { CARDS_LIST_EMPTY_DECK } from '../classes';
import { SpacedRepetitionItem } from 'src/spaced-repetition';
import { formatTimeDifference } from 'src/util';
import { DeleteItemEvent, EditItemEvent } from 'src/data/event/events';
import { TextComponent } from 'obsidian';

const cardAttributes = {
  cardId: 'data-card-id',
};

export class CardsView extends RecallSubView {
  private rootEl: HTMLElement;
  private cardsListEl: HTMLElement | null = null;
  private deck: Deck;
  private searchQuery = '';
  /** Scroll position to restore when returning from card editor. */
  private savedScrollTop: number | null = null;
  private readonly handleEditItemHandler = (event: EditItemEvent) => {
    this.handleEditItem(event);
  };
  private readonly handleAddItemHandler = () => {
    this.handleAddItem();
  };
  private readonly handleDeleteItemHandler = (event: DeleteItemEvent) => {
    this.handleDeleteItem(event);
  };
  private readonly handleBackHandler = () => {
    this.recallView.openDecksView();
  };
  private readonly handleAddCardHandler = () => {
    this.recallView.openCardEditorView(this.deck, null, 'cards');
  };

  constructor(
    protected readonly plugin: BetterRecallPlugin,
    protected readonly recallView: RecallView,
  ) {
    super(plugin, recallView);
  }

  public setDeck(deck: Deck): void {
    this.deck = deck;
  }

  public render(): void {
    this.plugin.getEventEmitter().off('editItem', this.handleEditItemHandler);
    this.plugin.getEventEmitter().off('addItem', this.handleAddItemHandler);
    this.plugin
      .getEventEmitter()
      .off('deleteItem', this.handleDeleteItemHandler);
    this.plugin.getEventEmitter().on('editItem', this.handleEditItemHandler);
    this.plugin.getEventEmitter().on('addItem', this.handleAddItemHandler);
    this.plugin
      .getEventEmitter()
      .on('deleteItem', this.handleDeleteItemHandler);

    this.deck = this.plugin.decksManager.getDecks()[this.deck.id];
    this.rootEl = this.recallView.rootEl.createDiv('better-recall-cards-view');
    this.renderBackButton(this.rootEl);
    this.renderSearchInput();

    this.cardsListEl = this.rootEl.createDiv(
      'better-recall-card better-recall__cards-list',
    );
    this.renderCardsList();

    new ButtonsBar(this.rootEl)
      .setSubmitButtonDisabled(false)
      .setSubmitText('Add card')
      .onSubmit(this.handleAddCardHandler)
      .onClose(this.handleBackHandler)
      .setCloseButtonText('Back');

    if (this.savedScrollTop != null) {
      window.requestAnimationFrame(() => {
        const scrollEl = this.getScrollContainer();
        if (scrollEl) {
          scrollEl.scrollTop = this.savedScrollTop!;
          this.savedScrollTop = null;
        }
      });
    }
  }

  private renderCardsList(): void {
    if (!this.cardsListEl) return;

    this.cardsListEl.empty();
    const cardsListEl = this.cardsListEl;
    const visibleCards = this.getVisibleCards();

    if (visibleCards.length > 0) {
      visibleCards.forEach((card) => {
        const cardContainer = cardsListEl.createDiv({
          cls: 'better-recall__cards-list-row',
          attr: { [cardAttributes.cardId]: card.id },
        });
        cardContainer.createDiv({
          text: `${card.content.front} :: ${card.content.back}`,
        });
        const statusRow = cardContainer.createDiv(
          'better-recall__cards-list-status',
        );
        statusRow.setText(this.getStatusRowText(card));
        cardContainer.onClickEvent(() => {
          this.recallView.openCardEditorView(this.deck, card);
        });
      });
    } else if (this.deck.cardsArray.length === 0) {
      this.cardsListEl.createEl('p', {
        cls: CARDS_LIST_EMPTY_DECK,
        text: 'No cards created for this deck',
        attr: { [cardAttributes.cardId]: 'none' },
      });
    } else {
      this.cardsListEl.createEl('p', {
        cls: CARDS_LIST_EMPTY_DECK,
        text: 'No cards match your search',
        attr: { [cardAttributes.cardId]: 'none' },
      });
    }
  }

  private getScrollContainer(): Element | null {
    return this.cardsListEl;
  }

  private renderSearchInput(): void {
    const searchContainerEl = this.rootEl.createDiv(
      'better-recall__cards-search',
    );
    const searchInput = new TextComponent(searchContainerEl)
      .setPlaceholder('Search cards')
      .setValue(this.searchQuery)
      .onChange((value) => {
        this.searchQuery = value;
        this.renderCardsList();
      });
    searchInput.inputEl.addClass('better-recall-field');
  }

  private getVisibleCards(): SpacedRepetitionItem[] {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      return this.deck.cardsArray;
    }
    return this.deck.cardsArray.filter((card) => {
      const front = card.content.front.toLowerCase();
      const back = card.content.back.toLowerCase();
      return front.includes(query) || back.includes(query);
    });
  }

  private getStatusRowText(card: SpacedRepetitionItem): string {
    if (!card.nextReviewDate) {
      return 'Unscheduled';
    }
    const now = new Date();
    if (card.nextReviewDate <= now) {
      return 'Due now';
    }
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    if (card.nextReviewDate <= endOfToday) {
      return `Due today · ${formatTimeDifference(card.nextReviewDate)}`;
    }
    return `Scheduled · ${formatTimeDifference(card.nextReviewDate)}`;
  }

  private handleDeleteItem({ payload }: DeleteItemEvent): void {
    if (!payload) return;
    const cardEl = this.rootEl.querySelector(
      `[${cardAttributes.cardId}="${payload.deletedItem.id}"]`,
    );
    cardEl?.remove();
  }

  private handleAddItem(): void {
    this.captureCurrentScroll();
    this.rootEl.empty();
    this.render();
  }

  private handleEditItem({ payload }: EditItemEvent): void {
    if (!payload) return;
    this.captureCurrentScroll();
    this.rootEl.empty();
    this.render();
  }

  private captureCurrentScroll(): void {
    const scrollEl = this.getScrollContainer();
    if (scrollEl && 'scrollTop' in scrollEl) {
      this.savedScrollTop = (scrollEl as HTMLElement).scrollTop;
    }
  }

  public onClose(): void {
    this.captureCurrentScroll();
    this.cardsListEl = null;
    this.plugin.getEventEmitter().off('editItem', this.handleEditItemHandler);
    this.plugin.getEventEmitter().off('addItem', this.handleAddItemHandler);
    this.plugin
      .getEventEmitter()
      .off('deleteItem', this.handleDeleteItemHandler);
  }
}
