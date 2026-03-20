import { RecallSubView } from './SubView';
import BetterRecallPlugin from 'src/main';
import { RecallView } from '.';
import { Deck } from 'src/data/deck';
import { ButtonsBarComponent as ButtonsBar } from '../components/ButtonsBarComponent';
import { CARDS_LIST_EMPTY_DECK } from '../classes';
import { SpacedRepetitionItem } from 'src/spaced-repetition';
import { formatTimeDifference } from 'src/util';
import { DeleteItemEvent, EditItemEvent } from 'src/data/event/events';

const cardAttributes = {
  cardId: 'data-card-id',
};

export class CardsView extends RecallSubView {
  private rootEl: HTMLElement;
  private cardsListEl: HTMLElement | null = null;
  private deck: Deck;
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

    this.cardsListEl = this.rootEl.createDiv(
      'better-recall-card better-recall__cards-list',
    );
    const cardsListEl = this.cardsListEl;

    if (this.deck.cardsArray.length > 0) {
      this.deck.cardsArray.forEach((card) => {
        const cardContainer = cardsListEl.createEl('div', {
          attr: { [cardAttributes.cardId]: card.id },
        });
        cardContainer.createEl('div', {
          text: `${card.content.front} :: ${card.content.back}`,
        });
        const statusRow = cardContainer.createEl('div', {
          cls: 'better-recall__cards-list-status',
        });
        statusRow.setText(this.getStatusRowText(card));
        cardContainer.onClickEvent(() => {
          this.recallView.openCardEditorView(this.deck, card);
        });
      });
    } else {
      this.cardsListEl.createEl('p', {
        cls: CARDS_LIST_EMPTY_DECK,
        text: 'No cards created for this deck',
        attr: { [cardAttributes.cardId]: 'none' },
      });
    }

    new ButtonsBar(this.rootEl)
      .setSubmitButtonDisabled(false)
      .setSubmitText('Add card')
      .onSubmit(this.handleAddCardHandler)
      .onClose(this.handleBackHandler)
      .setCloseButtonText('Back');

    if (this.savedScrollTop != null) {
      requestAnimationFrame(() => {
        const scrollEl = this.getScrollContainer();
        if (scrollEl) {
          scrollEl.scrollTop = this.savedScrollTop!;
          this.savedScrollTop = null;
        }
      });
    }
  }

  private getScrollContainer(): Element | null {
    return this.cardsListEl;
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
