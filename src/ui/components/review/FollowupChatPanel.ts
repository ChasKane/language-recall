import { ButtonComponent, Component, MarkdownRenderer, Notice } from 'obsidian';
import BetterRecallPlugin from 'src/main';
import {
  CardEditProposal,
  buildCardUpdatedContextMessage,
  GeminiChatMessage,
  GeminiFollowupMode,
} from 'src/util/gemini';
import { sendFollowupWithFallback } from 'src/util/followup-send';
import { promptFallbackApiKey } from './FallbackApiKeyModal';
export interface FollowupChatPanelOptions {
  plugin: BetterRecallPlugin;
  mode?: GeminiFollowupMode;
  getCardContent: () => { front: string; back: string };
  initialMessages: GeminiChatMessage[];
  onMessagesChange: (messages: GeminiChatMessage[]) => void;
  onApplyCardEdit: (edit: CardEditProposal) => Promise<CardEditProposal>;
  onSaveCard?: () => Promise<void>;
  onInputFocusChange?: (focused: boolean) => void;
}

export class FollowupChatPanel {
  private rootEl: HTMLElement | null = null;
  private messagesEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private sendButton: ButtonComponent | null = null;
  private messages: GeminiChatMessage[];
  private readonly markdownComponent = new Component();
  private readonly vaultRootPath: string;
  private cardFront = '';
  private cardBack = '';
  private isLoading = false;
  private abortController: AbortController | null = null;
  private readonly focusGuardAbortController = new AbortController();
  private readonly mode: GeminiFollowupMode;

  constructor(private readonly options: FollowupChatPanelOptions) {
    this.mode = options.mode ?? 'review';
    this.messages = [...options.initialMessages];
    this.vaultRootPath = options.plugin.app.vault.getRoot().path;
    options.plugin.addChild(this.markdownComponent);
    this.syncCardContentFromSource();
  }

  public render(parent: HTMLElement): void {
    this.rootEl = parent.createDiv('better-recall-review-followup');

    this.messagesEl = this.rootEl.createDiv(
      'better-recall-review-followup__messages',
    );

    const inputRowEl = this.rootEl.createDiv(
      'better-recall-review-followup__input-row',
    );
    this.inputEl = inputRowEl.createEl('textarea', {
      cls: 'better-recall-review-followup__input',
      attr: {
        rows: '1',
        placeholder:
          this.mode === 'draft'
            ? 'Ask AI to help write or edit this card…'
            : 'Ask a follow-up question…',
      },
    });
    this.sendButton = new ButtonComponent(inputRowEl)
      .setButtonText('Send')
      .setCta()
      .onClick(() => void this.handleSend());
    this.sendButton.buttonEl.addEventListener(
      'mousedown',
      this.preventInputBlurBeforeSend,
      { signal: this.focusGuardAbortController.signal },
    );

    this.inputEl.addEventListener('keydown', this.handleInputKeydown);
    this.setupMobileInputHandling();
    for (const message of this.messages) {
      this.renderMessage(message);
    }

    this.focusInputOnMount();
  }

  public destroy(): void {
    this.persistMessages();
    this.abortController?.abort();
    this.abortController = null;
    this.isLoading = false;
    this.focusGuardAbortController.abort();
    this.markdownComponent.unload();

    this.inputEl?.removeEventListener('keydown', this.handleInputKeydown);

    this.rootEl?.remove();
    this.rootEl = null;
    this.messagesEl = null;
    this.inputEl = null;
    this.sendButton = null;
  }

  private readonly handleInputKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.handleSend();
    }
  };

  private readonly preventInputBlurBeforeSend = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly handleInternalLinkClick = (event: MouseEvent): void => {
    event.preventDefault();
    const href = (event.target as HTMLAnchorElement).getAttribute('data-href');
    if (href) {
      void this.options.plugin.app.workspace.openLinkText(
        href,
        this.vaultRootPath,
        true,
      );
    }
  };

  private setupMobileInputHandling(): void {
    if (!this.inputEl) {
      return;
    }

    const signal = this.focusGuardAbortController.signal;
    const windowEl = this.inputEl.ownerDocument.defaultView;
    const visualViewport = windowEl?.visualViewport;

    this.inputEl.addEventListener(
      'focus',
      () => {
        this.options.onInputFocusChange?.(true);
        this.scheduleEnsureVisible();
      },
      { signal },
    );

    this.inputEl.addEventListener(
      'blur',
      () => {
        this.options.onInputFocusChange?.(false);
      },
      { signal },
    );

    visualViewport?.addEventListener(
      'resize',
      () => {
        if (this.inputEl?.ownerDocument.activeElement !== this.inputEl) {
          return;
        }
        this.scheduleEnsureVisible();
      },
      { signal },
    );
  }

  private focusInputOnMount(): void {
    const inputEl = this.inputEl;
    const windowEl = inputEl?.ownerDocument.defaultView;
    if (!inputEl || !windowEl) {
      return;
    }

    const focus = () => inputEl.focus();
    windowEl.requestAnimationFrame(focus);
  }

  private scheduleEnsureVisible(): void {
    const inputEl = this.inputEl;
    const windowEl = inputEl?.ownerDocument.defaultView;
    if (!windowEl || !inputEl) {
      return;
    }

    const runEnsureVisible = () => {
      if (inputEl.ownerDocument.activeElement !== inputEl) {
        return;
      }
      inputEl.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'auto',
      });
      this.messagesEl?.scrollTo({
        top: this.messagesEl.scrollHeight,
        behavior: 'auto',
      });
    };

    windowEl.requestAnimationFrame(runEnsureVisible);
    windowEl.setTimeout(runEnsureVisible, 100);
    windowEl.setTimeout(runEnsureVisible, 250);
  }

  private async handleSend(): Promise<void> {
    if (!this.inputEl || !this.messagesEl || this.isLoading) {
      return;
    }

    const userMessage = this.inputEl.value.trim();
    if (!userMessage) {
      return;
    }

    const apiKey = this.options.plugin.getSettings().geminiApiKey;
    if (!apiKey.trim()) {
      new Notice('Add a Gemini API key in Language Recall settings', 5000);
      return;
    }

    this.isLoading = true;
    this.inputEl.value = '';
    this.inputEl.disabled = true;
    this.sendButton?.setDisabled(true);
    this.appendUserMessage(userMessage);

    const loadingEl = this.appendAssistantText('Thinking…');
    loadingEl.addClass('better-recall-review-followup__message--loading');

    this.abortController?.abort();
    this.abortController = new AbortController();

    this.syncCardContentFromSource();

    const settings = this.options.plugin.getSettings();

    try {
      const response = await sendFollowupWithFallback({
        geminiApiKey: apiKey,
        geminiModel: settings.geminiModel || 'gemini-2.5-flash',
        groqApiKey: settings.groqApiKey,
        openRouterApiKey: settings.openRouterApiKey,
        systemPrompt: settings.systemPrompt,
        chatHistoryLimit: settings.chatHistoryLimit,
        cardFront: this.cardFront,
        cardBack: this.cardBack,
        messages: this.messages,
        userMessage,
        mode: this.mode,
        signal: this.abortController.signal,
        promptFallbackKey: async (provider) => {
          loadingEl.setText('Gemini failed. Waiting for fallback API key…');
          const key = await promptFallbackApiKey(
            this.options.plugin.app,
            provider,
          );
          if (!key) {
            return null;
          }

          if (provider === 'groq') {
            this.options.plugin.setGroqApiKey(key);
          } else {
            this.options.plugin.setOpenRouterApiKey(key);
          }
          await this.options.plugin.savePluginData();
          loadingEl.setText('Thinking…');
          return key;
        },
      });

      loadingEl.remove();
      this.messages.push({ role: 'user', content: userMessage });
      const assistantMessage: GeminiChatMessage = {
        role: 'assistant',
        content: response.displayText,
        cardEdit: response.cardEdit,
        saveCard: response.saveCard,
      };
      this.messages.push(assistantMessage);
      this.renderMessage(assistantMessage);
      this.persistMessages();
    } catch (error) {
      loadingEl.remove();
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      const message =
        error instanceof Error ? error.message : 'AI request failed';
      new Notice(`Follow-up failed: ${message.split('\n')[0]}`, 8000);
      this.appendAssistantText(message);
    } finally {
      this.isLoading = false;
      if (this.inputEl) {
        this.inputEl.disabled = false;
      }
      this.sendButton?.setDisabled(false);
      this.abortController = null;
    }
  }

  private renderMessage(message: GeminiChatMessage): void {
    if (message.kind === 'card-updated') {
      this.renderCardUpdatedNotice();
      return;
    }

    if (message.role === 'user') {
      this.appendUserMessage(message.content);
      return;
    }

    const messageEl = this.appendAssistantText(message.content);
    if (message.cardEdit) {
      this.renderCardEditProposal(messageEl, message);
    }
    if (message.saveCard) {
      this.renderSaveCardProposal(messageEl, message);
    }
  }

  private renderCardEditProposal(
    messageEl: HTMLElement,
    message: GeminiChatMessage,
  ): void {
    if (!message.cardEdit) {
      return;
    }

    const proposalEl = messageEl.createDiv(
      'better-recall-review-followup__edit-proposal',
    );
    this.renderCardEditSide(proposalEl, 'Front', message.cardEdit.front);
    this.renderCardEditSide(proposalEl, 'Back', message.cardEdit.back);

    if (message.cardEditApplied) {
      proposalEl.createSpan({
        cls: 'better-recall-review-followup__edit-applied',
        text: this.mode === 'draft' ? 'Applied to form' : 'Applied to card',
      });
      return;
    }

    const applyLabel =
      this.mode === 'draft' ? 'Apply to form' : 'Apply to card';
    const applyButton = new ButtonComponent(proposalEl)
      .setButtonText(applyLabel)
      .setCta();
    applyButton.onClick(
      () => void this.handleApplyCardEdit(message, applyButton),
    );
  }

  private renderSaveCardProposal(
    messageEl: HTMLElement,
    message: GeminiChatMessage,
  ): void {
    if (!this.options.onSaveCard) {
      return;
    }

    if (message.saveCardApplied) {
      messageEl.createSpan({
        cls: 'better-recall-review-followup__edit-applied',
        text: 'Card saved',
      });
      return;
    }

    const saveButton = new ButtonComponent(messageEl)
      .setButtonText('Save card')
      .setCta();
    saveButton.onClick(() => void this.handleSaveCard(message, saveButton));
  }

  private renderCardEditSide(
    container: HTMLElement,
    label: string,
    text: string,
  ): void {
    const sideEl = container.createDiv(
      'better-recall-review-followup__edit-side',
    );
    sideEl.createSpan({
      cls: 'better-recall-review-followup__edit-label',
      text: label,
    });
    const editTextEl = sideEl.createDiv(
      'better-recall-review-followup__edit-text',
    );
    this.renderMarkdown(editTextEl, text);
  }

  private async handleApplyCardEdit(
    message: GeminiChatMessage,
    applyButton: ButtonComponent,
  ): Promise<void> {
    if (!message.cardEdit || message.cardEditApplied) {
      return;
    }

    applyButton.setDisabled(true);
    applyButton.setButtonText('Applying…');

    try {
      const applied = await this.options.onApplyCardEdit(message.cardEdit);
      message.cardEditApplied = true;
      this.syncCardContent(applied.front, applied.back);
      this.recordCardUpdateInHistory(applied);
      applyButton.setButtonText(
        this.mode === 'draft' ? 'Applied to form' : 'Applied to card',
      );
      this.persistMessages();
      new Notice(this.mode === 'draft' ? 'Form updated' : 'Card updated', 3000);
    } catch (error) {
      applyButton.setDisabled(false);
      applyButton.setButtonText(
        this.mode === 'draft' ? 'Apply to form' : 'Apply to card',
      );
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update card';
      new Notice(`Could not apply changes: ${errorMessage}`, 5000);
    }
  }

  private async handleSaveCard(
    message: GeminiChatMessage,
    saveButton: ButtonComponent,
  ): Promise<void> {
    if (!this.options.onSaveCard || message.saveCardApplied) {
      return;
    }

    saveButton.setDisabled(true);
    saveButton.setButtonText('Saving…');

    try {
      await this.options.onSaveCard();
      message.saveCardApplied = true;
      saveButton.setButtonText('Card saved');
      this.persistMessages();
      new Notice('Card saved', 3000);
    } catch (error) {
      saveButton.setDisabled(false);
      saveButton.setButtonText('Save card');
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to save card';
      new Notice(`Could not save card: ${errorMessage}`, 5000);
    }
  }

  private appendUserMessage(text: string): HTMLElement {
    return this.appendMessage('user', text);
  }

  private appendAssistantText(text: string): HTMLElement {
    return this.appendMessage('assistant', text);
  }

  private appendMessage(role: 'user' | 'assistant', text: string): HTMLElement {
    if (!this.messagesEl) {
      throw new Error('Follow-up chat is not open');
    }

    const messageEl = this.messagesEl.createDiv(
      `better-recall-review-followup__message better-recall-review-followup__message--${role}`,
    );
    if (role === 'assistant') {
      const contentEl = messageEl.createDiv(
        'better-recall-review-followup__message-content',
      );
      this.renderMarkdown(contentEl, text);
    } else {
      messageEl.setText(text);
    }
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    return messageEl;
  }

  private renderMarkdown(container: HTMLElement, source: string): void {
    void MarkdownRenderer.render(
      this.options.plugin.app,
      source,
      container,
      this.vaultRootPath,
      this.markdownComponent,
    );
    container.querySelectorAll('a.internal-link').forEach((link) => {
      link.addEventListener('click', this.handleInternalLinkClick);
    });
  }

  private persistMessages(): void {
    this.options.onMessagesChange([...this.messages]);
  }

  private syncCardContentFromSource(): void {
    const content = this.options.getCardContent();
    this.syncCardContent(content.front, content.back);
  }

  private syncCardContent(front: string, back: string): void {
    this.cardFront = front;
    this.cardBack = back;
  }

  private recordCardUpdateInHistory(content: CardEditProposal): void {
    this.messages.push({
      role: 'user',
      kind: 'card-updated',
      content: buildCardUpdatedContextMessage(content.front, content.back),
    });
    this.renderCardUpdatedNotice();
  }

  private renderCardUpdatedNotice(): void {
    if (!this.messagesEl) {
      return;
    }

    const noticeEl = this.messagesEl.createDiv(
      'better-recall-review-followup__card-updated-notice',
    );
    noticeEl.setText(
      this.mode === 'draft'
        ? 'Form updated. AI will use the new text for all following messages.'
        : 'Card updated. AI will use the new text for all following messages.',
    );
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }
}
