import { v4 as uuidv4 } from 'uuid';
import { Notice } from 'obsidian';
import { RecallSubView } from './SubView';
import BetterRecallPlugin from 'src/main';
import { RecallView } from '.';
import { Deck } from 'src/data/deck';
import { CardEditor } from '../components/card-editor/CardEditor';
import {
  CardState,
  CardType,
  SpacedRepetitionItem,
} from 'src/spaced-repetition';

export class CardEditorView extends RecallSubView {
  private rootEl: HTMLElement;
  private deck: Deck | null = null;
  private card: SpacedRepetitionItem | null = null;
  private cardEditor: CardEditor | null = null;

  constructor(
    protected readonly plugin: BetterRecallPlugin,
    protected readonly recallView: RecallView,
  ) {
    super(plugin, recallView);
  }

  public setContext(
    deck: Deck | null,
    card: SpacedRepetitionItem | null,
  ): void {
    this.deck = deck;
    this.card = card;
  }

  public render(): void {
    this.rootEl = this.recallView.rootEl.createDiv(
      'better-recall-card-editor-view',
    );
    this.renderBackButton(this.rootEl);

    const mode = this.card ? 'edit' : 'add';
    const deck = this.deck ?? null;

    this.cardEditor = new CardEditor(
      this.rootEl,
      this.plugin,
      {
        mode,
        deck: deck ?? undefined,
        card: this.card ?? undefined,
      },
      {
        onCancel: () => this.recallView.goBackFromCardEditor(),
        onSubmit: () => this.handleSubmit(),
        onDuplicate: mode === 'edit' ? () => this.handleDuplicate() : undefined,
        onDelete: mode === 'edit' ? () => this.handleDelete() : undefined,
      },
    );
  }

  private async handleSubmit(): Promise<void> {
    if (!this.cardEditor) return;

    const deckId = this.cardEditor.getDeckId();
    const front = this.cardEditor.getFront();
    const back = this.cardEditor.getBack();

    try {
      if (this.card) {
        const updatedCard = {
          ...this.card,
          content: { front, back },
        };
        const oldDeckId = this.deck!.id;
        if (deckId === oldDeckId) {
          await this.plugin.decksManager.updateCardContent(deckId, updatedCard);
        } else {
          await this.plugin.decksManager.removeCard(oldDeckId, updatedCard.id);
          await this.plugin.decksManager.addCard(deckId, updatedCard);
          this.plugin
            .getEventEmitter()
            .emit('deleteItem', { deckId: oldDeckId, deletedItem: this.card });
          this.plugin
            .getEventEmitter()
            .emit('addItem', { deckId, item: updatedCard });
        }
        this.plugin
          .getEventEmitter()
          .emit('editItem', { deckId, newItem: updatedCard });
      } else {
        const card: SpacedRepetitionItem = {
          id: uuidv4(),
          type: CardType.BASIC,
          content: { front, back },
          state: CardState.NEW,
          easeFactor: 2.5,
          interval: 0,
          iteration: 0,
          stepIndex: 0,
          nextReviewDate: new Date(),
        };
        await this.plugin.decksManager.addCard(deckId, card);
        this.plugin.getEventEmitter().emit('addItem', { deckId, item: card });
      }

      this.cardEditor.clearInputs();
      new Notice(this.card ? 'Card saved' : 'Card added', 3000);
      if (this.card) this.recallView.goBackFromCardEditor();
    } catch (err) {
      new Notice(err instanceof Error ? err.message : String(err), 5000);
      throw err;
    }
  }

  private async handleDuplicate(): Promise<void> {
    if (!this.cardEditor) return;

    const deckId = this.cardEditor.getDeckId();
    const card: SpacedRepetitionItem = {
      id: uuidv4(),
      type: CardType.BASIC,
      content: {
        front: this.cardEditor.getFront(),
        back: this.cardEditor.getBack(),
      },
      state: CardState.NEW,
      easeFactor: 2.5,
      interval: 0,
      iteration: 0,
      stepIndex: 0,
      nextReviewDate: new Date(),
    };

    try {
      await this.plugin.decksManager.addCard(deckId, card);
      this.plugin.getEventEmitter().emit('addItem', { deckId, item: card });
      new Notice('Card duplicated', 3000);
    } catch (err) {
      new Notice(err instanceof Error ? err.message : String(err), 5000);
      throw err;
    }
  }

  private async handleDelete(): Promise<void> {
    if (!this.card || !this.deck) return;
    try {
      await this.plugin.decksManager.removeCard(this.deck.id, this.card.id);
      this.plugin
        .getEventEmitter()
        .emit('deleteItem', { deckId: this.deck.id, deletedItem: this.card });
      new Notice('Card deleted', 3000);
      this.recallView.goBackFromCardEditor();
    } catch (err) {
      new Notice(err instanceof Error ? err.message : String(err), 5000);
      throw err;
    }
  }

  public onClose(): void {
    this.cardEditor?.cleanup();
    this.cardEditor = null;
  }
}
