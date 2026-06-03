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
import { CardEditProposal, GeminiChatMessage } from 'src/util/gemini';

interface PreservedFormState {
  front: string;
  back: string;
  deckId: string;
}

export class CardEditorView extends RecallSubView {
  private rootEl: HTMLElement;
  private deck: Deck | null = null;
  private card: SpacedRepetitionItem | null = null;
  private cardEditor: CardEditor | null = null;
  private preservedFormState: PreservedFormState | null = null;
  private followupMessages: GeminiChatMessage[] = [];

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

  public preserveFormStateForFollowup(): void {
    if (!this.cardEditor) {
      return;
    }
    this.preservedFormState = {
      front: this.cardEditor.getFront(),
      back: this.cardEditor.getBack(),
      deckId: this.cardEditor.getDeckId(),
    };
  }

  public clearSessionState(): void {
    this.preservedFormState = null;
    this.followupMessages = [];
  }

  public hasFollowupConversation(): boolean {
    return this.followupMessages.length > 0;
  }

  public render(): void {
    this.rootEl = this.recallView.rootEl.createDiv(
      'better-recall-card-editor-view',
    );
    this.renderBackButton(this.rootEl);

    const mode = this.card ? 'edit' : 'add';
    const deck = this.deck ?? null;
    const initialFront =
      this.preservedFormState?.front ?? this.card?.content.front;
    const initialBack =
      this.preservedFormState?.back ?? this.card?.content.back;
    const initialDeckId = this.preservedFormState?.deckId;

    this.cardEditor = new CardEditor(
      this.rootEl,
      this.plugin,
      {
        mode,
        deck: deck ?? undefined,
        card: this.card ?? undefined,
        initialFront,
        initialBack,
        initialDeckId,
      },
      {
        onCancel: () => this.recallView.goBackFromCardEditor(),
        onSubmit: () => this.handleSubmit(),
        onOpenAi: () => this.openFollowupChat(),
        hasAiConversation: this.followupMessages.length > 0,
        onDuplicate: mode === 'edit' ? () => this.handleDuplicate() : undefined,
        onDelete: mode === 'edit' ? () => this.handleDelete() : undefined,
      },
    );
  }

  private openFollowupChat(): void {
    const apiKey = this.plugin.getSettings().geminiApiKey;
    if (!apiKey.trim()) {
      new Notice('Add a Gemini API key in Language Recall settings', 5000);
      return;
    }

    this.preserveFormStateForFollowup();

    this.recallView.openFollowupView({
      mode: 'draft',
      returnTo: 'card-editor',
      deck: this.deck,
      card: this.card,
      getCardContent: () => ({
        front: this.preservedFormState?.front ?? '',
        back: this.preservedFormState?.back ?? '',
      }),
      initialMessages: this.followupMessages,
      onMessagesChange: (messages) => {
        this.followupMessages = messages;
      },
      onApplyCardEdit: async (edit) => this.applyDraftCardEdit(edit),
      onSaveCard: async () => {
        await this.handleSubmit();
      },
    });
  }

  private applyDraftCardEdit(edit: CardEditProposal): Promise<CardEditProposal> {
    this.preservedFormState = {
      front: edit.front,
      back: edit.back,
      deckId:
        this.preservedFormState?.deckId ??
        this.cardEditor?.getDeckId() ??
        this.plugin.getSettings().lastSelectedDeckId,
    };
    return Promise.resolve(edit);
  }

  private async handleSubmit(): Promise<void> {
    if (!this.cardEditor && this.preservedFormState) {
      await this.submitPreservedFormState();
      return;
    }
    if (!this.cardEditor) return;

    const deckId = this.cardEditor.getDeckId();
    const front = this.cardEditor.getFront();
    const back = this.cardEditor.getBack();

    await this.saveCard(deckId, front, back);
  }

  private async submitPreservedFormState(): Promise<void> {
    if (!this.preservedFormState) {
      return;
    }

    const { deckId, front, back } = this.preservedFormState;
    await this.saveCard(deckId, front, back);
  }

  private async saveCard(
    deckId: string,
    front: string,
    back: string,
  ): Promise<void> {
    if (!front.trim() || !back.trim()) {
      throw new Error('Fill in both front and back before saving');
    }

    try {
      if (this.card) {
        const nextReviewDate =
          this.cardEditor?.getNextReviewDate() ?? this.card.nextReviewDate;
        const updatedCard = {
          ...this.card,
          content: { front, back },
          nextReviewDate,
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
        this.preservedFormState = null;
        new Notice('Card saved', 3000);
        this.recallView.goBackFromCardEditor();
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
        this.preservedFormState = {
          front: '',
          back: '',
          deckId,
        };
        this.cardEditor?.clearInputs();
        new Notice('Card added', 3000);
      }
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
