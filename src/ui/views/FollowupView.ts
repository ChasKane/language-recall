import BetterRecallPlugin from 'src/main';
import { RecallView } from '.';
import { RecallSubView } from './SubView';
import { Deck } from 'src/data/deck';
import { SpacedRepetitionItem } from 'src/spaced-repetition';
import { FollowupChatPanel } from '../components/review/FollowupChatPanel';
import {
  CardEditProposal,
  GeminiChatMessage,
  GeminiFollowupMode,
} from 'src/util/gemini';

export type FollowupReturnTo = 'review' | 'card-editor';

export interface FollowupViewContext {
  mode: GeminiFollowupMode;
  returnTo: FollowupReturnTo;
  deck: Deck | null;
  card: SpacedRepetitionItem | null;
  getCardContent: () => { front: string; back: string };
  initialMessages: GeminiChatMessage[];
  onMessagesChange: (messages: GeminiChatMessage[]) => void;
  onApplyCardEdit: (edit: CardEditProposal) => Promise<CardEditProposal>;
  onSaveCard?: () => Promise<void>;
}

export class FollowupView extends RecallSubView {
  private rootEl: HTMLElement;
  private context: FollowupViewContext | null = null;
  private chatPanel: FollowupChatPanel | null = null;
  private cardPreviewEl: HTMLElement | null = null;
  private cardFrontEl: HTMLElement | null = null;
  private cardBackEl: HTMLElement | null = null;

  constructor(
    protected readonly plugin: BetterRecallPlugin,
    protected readonly recallView: RecallView,
  ) {
    super(plugin, recallView);
  }

  public setContext(context: FollowupViewContext): void {
    this.context = context;

    this.chatPanel = new FollowupChatPanel({
      plugin: this.plugin,
      mode: context.mode,
      getCardContent: context.getCardContent,
      initialMessages: context.initialMessages,
      onMessagesChange: context.onMessagesChange,
      onApplyCardEdit: async (edit) => {
        const applied = await context.onApplyCardEdit(edit);
        if (context.card) {
          context.card = {
            ...context.card,
            content: applied,
          };
        }
        this.updateCardPreview(applied.front, applied.back);
        return applied;
      },
      onSaveCard: context.onSaveCard,
      onInputFocusChange: (focused) => {
        this.rootEl?.toggleClass(
          'better-recall-followup-view--input-focused',
          focused,
        );
      },
    });
  }

  public render(): void {
    this.rootEl = this.recallView.rootEl.createDiv(
      'better-recall-followup-view',
    );
    this.renderBackButton(this.rootEl, () =>
      this.recallView.goBackFromFollowup(),
    );

    if (!this.context || !this.chatPanel) {
      this.rootEl.createEl('p', {
        text: 'AI session could not be restored. Please go back and try again.',
      });
      return;
    }

    const headerEl = this.rootEl.createDiv(
      'better-recall-followup-view__header',
    );
    headerEl.createSpan({
      cls: 'better-recall-followup-view__title',
      text:
        this.context.mode === 'draft' ? 'AI card assistant' : 'AI follow-up',
    });

    this.cardPreviewEl = this.rootEl.createDiv(
      'better-recall-followup-view__card-preview better-recall-card',
    );
    this.cardFrontEl = this.cardPreviewEl.createDiv(
      'better-recall-followup-view__card-side',
    );
    this.cardPreviewEl.createDiv('better-recall-review-card__divider');
    this.cardBackEl = this.cardPreviewEl.createDiv(
      'better-recall-followup-view__card-side',
    );
    const content = this.context.getCardContent();
    this.updateCardPreview(content.front, content.back);

    const chatContainerEl = this.rootEl.createDiv(
      'better-recall-followup-view__chat better-recall-card',
    );
    this.chatPanel.render(chatContainerEl);
  }

  public onClose(): void {
    this.chatPanel?.destroy();
    this.chatPanel = null;
    this.context = null;
    super.onClose();
  }

  private updateCardPreview(front: string, back: string): void {
    const frontText = front.trim() || '(empty front)';
    const backText = back.trim() || '(empty back)';
    this.cardFrontEl?.setText(frontText);
    this.cardBackEl?.setText(backText);
    this.cardPreviewEl?.toggleClass(
      'better-recall-followup-view__card-preview--empty',
      !front.trim() && !back.trim(),
    );
  }
}
