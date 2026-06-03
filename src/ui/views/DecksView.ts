import { ButtonComponent, getIcon } from 'obsidian';
import { RecallSubView } from './SubView';
import BetterRecallPlugin from 'src/main';
import { RecallView } from '.';
import { Deck } from 'src/data/deck';
import { DECK_BUTTON, DECK_MAIN, DUE_CARDS_COLOR } from '../classes';
import {
  AddItemEvent,
  DeleteItemEvent,
  EditDeckEvent,
} from 'src/data/event/events';

const rowAttributes = {
  dueCardsCount: {
    plain: 'data-due-cards-count',
    attr: '[data-due-cards-count]',
  },
  scheduledCardsCount: {
    plain: 'data-scheduled-cards-count',
    attr: '[data-scheduled-cards-count]',
  },
  totalCardsCount: {
    plain: 'data-total-cards-count',
    attr: '[data-total-cards-count]',
  },
};

export class DecksView extends RecallSubView {
  private rootEl: HTMLElement;
  private contentEl: HTMLElement;
  private readonly handleAddDeckHandler = () => {
    this.handleAddDeck();
  };
  private readonly handleEditDeckHandler = (event: EditDeckEvent) => {
    this.handleEditDeck(event);
  };
  private readonly handleAddItemHandler = (event: AddItemEvent) => {
    this.handleAddItem(event);
  };
  private readonly handleDeleteItemHandler = (event: DeleteItemEvent) => {
    this.handleDeleteItem(event);
  };
  private readonly handleDeleteDeckHandler = () => {
    this.handleDeleteDeck();
  };
  constructor(plugin: BetterRecallPlugin, recallView: RecallView) {
    super(plugin, recallView);
  }

  public render(): void {
    this.plugin.getEventEmitter().off('addDeck', this.handleAddDeckHandler);
    this.plugin.getEventEmitter().off('editDeck', this.handleEditDeckHandler);
    this.plugin.getEventEmitter().off('addItem', this.handleAddItemHandler);
    this.plugin
      .getEventEmitter()
      .off('deleteItem', this.handleDeleteItemHandler);
    this.plugin
      .getEventEmitter()
      .off('deleteDeck', this.handleDeleteDeckHandler);
    this.plugin.getEventEmitter().on('addDeck', this.handleAddDeckHandler);
    this.plugin.getEventEmitter().on('editDeck', this.handleEditDeckHandler);
    this.plugin.getEventEmitter().on('addItem', this.handleAddItemHandler);
    this.plugin
      .getEventEmitter()
      .on('deleteItem', this.handleDeleteItemHandler);
    this.plugin
      .getEventEmitter()
      .on('deleteDeck', this.handleDeleteDeckHandler);

    this.rootEl = this.recallView.rootEl.createDiv('better-recall-decks-view');
    this.contentEl = this.rootEl.createDiv('better-recall-decks-view__content');

    this.renderDecks();
    this.renderButtons();
  }

  private handleDeleteDeck(): void {
    if (this.plugin.decksManager.decksArray.length === 0) {
      this.recallView.openEmptyView();
      return;
    }

    this.recallView.rootEl.empty();
    this.render();
  }

  private handleAddDeck(): void {
    this.recallView.rootEl.empty();
    this.render();
  }

  private handleEditDeck({ payload }: EditDeckEvent): void {
    if (!payload) {
      return;
    }

    const { deck } = payload;

    const deckNameEl = this.getDeckRowEl(deck.id)?.querySelector<HTMLElement>(
      '.better-recall-deck-name__title',
    );
    if (!deckNameEl) {
      return;
    }

    deckNameEl.setText(deck.getName());
    deckNameEl.title = deck.getDescription();

    const deckCardEl = this.getDeckRowEl(deck.id);
    if (!deckCardEl) {
      return;
    }

    const currentDescriptionEl = deckCardEl.querySelector<HTMLElement>(
      '.better-recall-deck-card__description',
    );
    const description = deck.getDescription();
    if (!description) {
      currentDescriptionEl?.remove();
      return;
    }

    if (currentDescriptionEl) {
      currentDescriptionEl.setText(description);
      return;
    }

    const headerEl = deckCardEl.querySelector(
      '.better-recall-deck-card__header',
    );
    if (!headerEl) {
      return;
    }

    const descriptionEl = deckCardEl.createEl('p', {
      cls: 'better-recall-deck-card__description',
      text: description,
    });
    headerEl.insertAdjacentElement('afterend', descriptionEl);
  }

  private handleDeleteItem({ payload }: DeleteItemEvent): void {
    if (!payload) {
      return;
    }

    const { deckId } = payload;

    const deckRowEl = this.getDeckRowEl(deckId);
    if (!deckRowEl) {
      return;
    }

    this.refreshDueCardsCount(deckId, deckRowEl);
    this.refreshTotalCardsCount(deckId, deckRowEl);
  }

  private handleAddItem({ payload }: AddItemEvent): void {
    if (!payload) {
      return;
    }

    const { deckId } = payload;

    const deckRowEl = this.getDeckRowEl(deckId);
    if (!deckRowEl) {
      return;
    }

    this.refreshDueCardsCount(deckId, deckRowEl);
    this.refreshTotalCardsCount(deckId, deckRowEl);
  }

  private refreshDueCardsCount(deckId: string, deckRowEl: HTMLElement): void {
    const cardsCountEl = this.getDueCardsCountEl(deckRowEl);
    if (!cardsCountEl) {
      return;
    }

    const cardsCount =
      this.plugin.decksManager.getDecks()[deckId].dueCards.length;
    this.updateCount(cardsCountEl, cardsCount, DUE_CARDS_COLOR);
  }

  private refreshTotalCardsCount(deckId: string, deckRowEl: HTMLElement): void {
    const cardsCountEl = this.getTotalCardsCountEl(deckRowEl);
    if (!cardsCountEl) {
      return;
    }

    const cardsCount =
      this.plugin.decksManager.getDecks()[deckId].cardsArray.length;
    cardsCountEl.removeClass(DUE_CARDS_COLOR);
    cardsCountEl.setText(String(cardsCount));
  }

  private updateCount(
    el: HTMLElement,
    cardsCount: number,
    className: string,
  ): void {
    if (cardsCount > 0) {
      if (!el.hasClass(className)) {
        el.addClass(className);
      }
    } else {
      el.removeClass(className);
    }
    el.setText(String(cardsCount));
  }

  private getDeckRowEl(deckId: string): HTMLElement | null {
    return this.recallView.rootEl.querySelector(`[data-deck-id="${deckId}"]`);
  }

  private getDueCardsCountEl(deckRowEl: HTMLElement): HTMLElement | null {
    return deckRowEl.querySelector(rowAttributes.dueCardsCount.attr);
  }

  private getTotalCardsCountEl(deckRowEl: HTMLElement): HTMLElement | null {
    return deckRowEl.querySelector(rowAttributes.totalCardsCount.attr);
  }

  private renderDecks(): void {
    if (!this.plugin.decksManager.isLoaded()) {
      this.contentEl
        .createDiv('better-recall-decks-loading')
        .setText('Loading decks…');
      return;
    }

    const decksListEl = this.contentEl.createDiv('better-recall-decks-list');

    this.plugin.decksManager.decksArray.forEach((deck) => {
      const deckCardEl = decksListEl.createDiv({
        cls: `better-recall-card ${DECK_MAIN}`,
        attr: {
          'data-deck-id': deck.id,
        },
      });
      const deckHeaderEl = deckCardEl.createDiv(
        'better-recall-deck-card__header',
      );
      const deckTitleWrapEl = deckHeaderEl.createDiv(
        'better-recall-deck-card__title-wrap',
      );

      const deckNameLink = deckTitleWrapEl.createEl('a', {
        text: deck.getName(),
        title: deck.getDescription(),
      });
      deckNameLink.addClass('better-recall-deck-name__title');

      if (deck.getDescription()) {
        deckTitleWrapEl.createEl('p', {
          cls: 'better-recall-deck-card__description',
          text: deck.getDescription(),
        });
      }

      const headerActionsEl = deckHeaderEl.createDiv(
        'better-recall-deck-card__header-actions',
      );
      this.renderDeckButtons(headerActionsEl, deck);

      const dueCardsLength = deck.dueCards.length;
      const totalCardsLength = deck.cardsArray.length;

      const deckStatsEl = deckCardEl.createDiv(
        'better-recall-deck-card__stats',
      );

      const dueCountEl = deckStatsEl.createDiv({
        cls: 'better-recall-deck-card__stat better-recall-deck-card__stat--clickable',
        attr: {
          role: 'button',
          tabindex: '0',
          title: 'Start review',
        },
      });
      dueCountEl.createEl('span', { text: 'Due' });
      dueCountEl.createEl('strong', {
        text: `${dueCardsLength}`,
        attr: { [rowAttributes.dueCardsCount.plain]: dueCardsLength },
        cls: dueCardsLength > 0 ? DUE_CARDS_COLOR : '',
      });
      dueCountEl.onClickEvent((ev) => {
        ev.stopPropagation();
        this.recallView.startReviewingDeck(deck);
      });

      const totalCountEl = deckStatsEl.createDiv({
        cls: 'better-recall-deck-card__stat better-recall-deck-card__stat--clickable',
        attr: {
          role: 'button',
          tabindex: '0',
          title: 'View cards',
        },
      });
      totalCountEl.createEl('span', { text: 'Total' });
      totalCountEl.createEl('strong', {
        text: `${totalCardsLength}`,
        attr: { [rowAttributes.totalCardsCount.plain]: totalCardsLength },
      });
      totalCountEl.onClickEvent((ev) => {
        ev.stopPropagation();
        this.recallView.openCardsView(deck);
      });

      const footerEl = deckCardEl.createDiv('better-recall-deck-card__footer');
      const addCardButton = new ButtonComponent(footerEl).setButtonText(
        'Add card',
      );
      addCardButton.buttonEl.addClass('better-recall-deck-card__add-card');
      addCardButton.onClick(() => {
        this.recallView.openCardEditorView(deck, null, 'decks');
      });

      this.renderReviewButton(footerEl, deck);
    });
  }

  private renderDeckButtons(root: HTMLElement, deck: Deck): void {
    const container = root.createDiv(
      'better-recall-deck-card__secondary-actions',
    );

    const cardsButtonEl = container.createDiv({
      cls: DECK_BUTTON,
      attr: {
        role: 'button',
        tabindex: '0',
      },
    });
    const walletCardsIcon = getIcon('wallet-cards');
    if (walletCardsIcon) {
      cardsButtonEl.appendChild(walletCardsIcon);
    }
    cardsButtonEl.onClickEvent(() => {
      this.recallView.openCardsView(deck);
    });

    const editButtonEl = container.createDiv({
      cls: DECK_BUTTON,
      attr: {
        role: 'button',
        tabindex: '0',
      },
    });
    const penIcon = getIcon('pen');
    if (penIcon) {
      editButtonEl.appendChild(penIcon);
    }
    editButtonEl.onClickEvent(() => {
      this.recallView.openEditDeckView(deck);
    });
  }

  private renderReviewButton(root: HTMLElement, deck: Deck): void {
    const reviewButton = new ButtonComponent(root)
      .setButtonText('Review')
      .setCta();
    reviewButton.buttonEl.addClass('better-recall-deck-card__review-button');
    reviewButton.buttonEl.setAttr('title', 'Start review');
    reviewButton.onClick((ev) => {
      ev.stopPropagation();
      this.recallView.startReviewingDeck(deck);
    });
  }

  private renderButtons(): void {
    const buttonsBarEl = this.contentEl.createDiv('better-recall-buttons-bar');

    // Settings button on the left
    const settingsButtonEl = buttonsBarEl.createDiv(
      'better-recall-settings-button',
    );
    settingsButtonEl.setAttr('role', 'button');
    settingsButtonEl.setAttr('tabindex', '0');
    settingsButtonEl.setAttr('title', 'Open settings');

    const settingsIcon = getIcon('settings');
    if (settingsIcon) {
      settingsButtonEl.appendChild(settingsIcon);
    }

    settingsButtonEl.onClickEvent(() => {
      const appWithSettings = this.plugin.app as unknown as {
        setting?: {
          open?: () => void;
          openTabById?: (id: string) => void;
        };
      };
      appWithSettings.setting?.open?.();
      appWithSettings.setting?.openTabById?.(this.plugin.manifest.id);
    });

    new ButtonComponent(buttonsBarEl)
      .setButtonText('Create deck')
      .onClick(() => this.recallView.openCreateDeckView());
  }

  public onClose(): void {
    this.plugin.getEventEmitter().off('addDeck', this.handleAddDeckHandler);
    this.plugin.getEventEmitter().off('editDeck', this.handleEditDeckHandler);
    this.plugin.getEventEmitter().off('addItem', this.handleAddItemHandler);
    this.plugin
      .getEventEmitter()
      .off('deleteItem', this.handleDeleteItemHandler);
    this.plugin
      .getEventEmitter()
      .off('deleteDeck', this.handleDeleteDeckHandler);
  }
}
