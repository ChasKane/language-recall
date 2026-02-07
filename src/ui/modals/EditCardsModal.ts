import { Modal } from 'obsidian';
import { DeleteItemEvent, EditItemEvent } from 'src/data/event/events';
import BetterRecallPlugin from '../../main';
import { ButtonsBarComponent } from '../components/ButtonsBarComponent';
import { Deck } from 'src/data/deck';
import { AddCardModal } from './card-modal/AddCardModal';
import { EditCardModal } from './card-modal/EditCardModal';
import { CARDS_LIST_EMPTY_DECK } from '../classes';
import { CardState } from 'src/spaced-repetition';
import { formatTimeDifference } from 'src/util';

const cardAttributes = {
  cardId: 'data-card-id',
};

export class EditCardsModal extends Modal {
  private buttonsBarComp: ButtonsBarComponent;
  private showTimeUntilReview: boolean = false;
  private readonly handleEditItemHandler = (event: EditItemEvent) => {
    this.handleEditItem(event);
  };
  private readonly handleAddItemHandler = () => {
    this.handleAddItem();
  };
  private readonly handleDeleteItemHandler = (event: DeleteItemEvent) => {
    this.handleDeleteItem(event);
  };
  private readonly openAddCardModalHandler = () => {
    this.openAddCardModal();
  };
  private readonly closeHandler = () => {
    this.close();
  };

  constructor(
    private plugin: BetterRecallPlugin,
    private deck: Deck,
  ) {
    super(plugin.app);
    this.setTitle(`Cards from "${deck.getName()}"`);
  }

  onOpen(): void {
    super.onOpen();
    this.render();

    this.plugin.getEventEmitter().on('editItem', this.handleEditItemHandler);
    this.plugin.getEventEmitter().on('addItem', this.handleAddItemHandler);
    this.plugin
      .getEventEmitter()
      .on('deleteItem', this.handleDeleteItemHandler);
  }

  private handleDeleteItem({ payload }: DeleteItemEvent): void {
    if (!payload) {
      return;
    }

    const { deletedItem } = payload;

    const cardEl = this.contentEl.querySelector(
      `[${cardAttributes.cardId}="${deletedItem.id}"]`,
    );
    cardEl?.remove();
  }

  private handleAddItem(): void {
    this.contentEl.empty();
    this.render();
  }

  private handleEditItem({ payload }: EditItemEvent): void {
    if (!payload) {
      return;
    }

    const { newItem } = payload;

    const cardEl = this.contentEl.querySelector(
      `[${cardAttributes.cardId}="${newItem.id}"]`,
    );
    if (!cardEl) {
      return;
    }

    this.contentEl.empty();
    this.render();
  }

  private render(): void {
    // Render checkbox at the top
    const checkboxContainer = this.contentEl.createDiv(
      'better-recall-edit-cards-modal__checkbox-container',
    );
    const checkbox = checkboxContainer.createEl('input', {
      type: 'checkbox',
      attr: {
        id: 'show-time-until-review',
      },
    });
    checkbox.checked = this.showTimeUntilReview;
    checkbox.onchange = (e) => {
      this.showTimeUntilReview = (e.target as HTMLInputElement).checked;
      this.contentEl.empty();
      this.render();
    };
    checkboxContainer.createEl('label', {
      text: 'Show time until next review',
      cls: 'better-recall-edit-cards-modal__checkbox-label',
      attr: {
        for: 'show-time-until-review',
      },
    });

    const decksCardEl = this.contentEl.createDiv(
      'better-recall-card better-recall__cards-list',
    );

    if (this.deck.cardsArray.length > 0) {
      this.deck.cardsArray.forEach((card) => {
        const cardContainer = decksCardEl.createEl('div', {
          attr: {
            [cardAttributes.cardId]: card.id,
          },
        });

        cardContainer.createEl('div', {
          text: `${card.content.front} :: ${card.content.back}`,
        });

        const statusOrTime = cardContainer.createEl('div', {
          cls: 'better-recall-edit-cards-modal__status',
        });

        if (this.showTimeUntilReview) {
          if (card.nextReviewDate) {
            statusOrTime.setText(formatTimeDifference(card.nextReviewDate));
          } else if (card.state === CardState.NEW) {
            statusOrTime.setText('Due now');
          } else {
            statusOrTime.setText('No review date');
          }
        } else {
          statusOrTime.setText(this.getCardStateLabel(card.state));
        }

        cardContainer.onClickEvent(() => {
          new EditCardModal(this.plugin, this.deck, card).open();
        });
      });
    } else {
      decksCardEl.createEl('p', {
        cls: CARDS_LIST_EMPTY_DECK,
        text: 'No cards created for this deck',
        attr: {
          [cardAttributes.cardId]: 'none',
        },
      });
    }

    this.buttonsBarComp = new ButtonsBarComponent(this.contentEl)
      .setSubmitButtonDisabled(false)
      .setSubmitText('Add card')
      .onSubmit(this.openAddCardModalHandler)
      .onClose(this.closeHandler);
  }

  private getCardStateLabel(state: CardState): string {
    switch (state) {
      case CardState.NEW:
        return 'New';
      case CardState.LEARNING:
        return 'Learning';
      case CardState.REVIEW:
        return 'Review';
      case CardState.RELEARNING:
        return 'Relearning';
      default:
        return 'Unknown';
    }
  }

  private openAddCardModal(): void {
    new AddCardModal(this.plugin).open();
  }

  onClose(): void {
    super.onClose();
    this.plugin.getEventEmitter().off('editItem', this.handleEditItemHandler);
    this.plugin.getEventEmitter().off('addItem', this.handleAddItemHandler);
    this.plugin
      .getEventEmitter()
      .off('deleteItem', this.handleDeleteItemHandler);
    // Cards are saved immediately when added/updated/removed, so no need to save here
    this.contentEl.empty();
  }
}
