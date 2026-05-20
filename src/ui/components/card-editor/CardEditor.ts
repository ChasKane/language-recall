import { ButtonComponent, DropdownComponent, Notice } from 'obsidian';
import BetterRecallPlugin from 'src/main';
import {
  CARD_MODAL_DESCRIPTION,
  SETTING_ITEM_DESCRIPTION,
} from 'src/ui/classes';
import { ButtonsBarComponent } from 'src/ui/components/ButtonsBarComponent';
import { InputAreaComponent } from 'src/ui/components/input/InputAreaComponent';
import { cn } from 'src/util';
import { translateText } from 'src/util/translation';
import { DEFAULT_SETTINGS } from 'src/settings/data';
import type { SpacedRepetitionItem } from 'src/spaced-repetition';
import type { Deck } from 'src/data/deck';
import { LANGUAGES } from './LANGUAGES';

export interface CardEditorOptions {
  mode: 'add' | 'edit';
  deck?: Deck;
  card?: SpacedRepetitionItem;
}

export interface CardEditorCallbacks {
  onCancel: () => void;
  onSubmit: () => void | Promise<void>;
  onDuplicate?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}

export class CardEditor {
  private optionsContainerEl: HTMLElement;
  private deckDropdownComp: DropdownComponent;
  private frontInputComp: InputAreaComponent;
  private backInputComp: InputAreaComponent;
  private buttonsBarComp: ButtonsBarComponent;
  private translateButtonComp: ButtonComponent | null = null;
  private translateCancelButtonComp: ButtonComponent | null = null;
  private sourceLangDropdownComp: DropdownComponent | null = null;
  private targetLangDropdownComp: DropdownComponent | null = null;
  private backFieldLabelContainer: HTMLElement | null = null;
  private translationAbortController: AbortController | null = null;
  private translationRequestId = 0;

  constructor(
    private containerEl: HTMLElement,
    private plugin: BetterRecallPlugin,
    private options: CardEditorOptions,
    private callbacks: CardEditorCallbacks,
  ) {
    this.optionsContainerEl = this.containerEl.createDiv(
      'better-recall-card__add-options',
    );
    this.renderDeckDropdown();
    this.renderCardTypeDropdown();
    this.renderBasicTypeFields(
      this.options.card?.content.front,
      this.options.card?.content.back,
    );
    if (this.options.mode === 'edit' && this.callbacks.onDelete) {
      const buttonsContainer = this.containerEl.createDiv(
        'better-recall__buttons-container',
      );
      const secondaryButtonsContainer = buttonsContainer.createDiv(
        'better-recall__secondary-buttons-container',
      );
      if (this.callbacks.onDuplicate) {
        new ButtonComponent(secondaryButtonsContainer)
          .setButtonText('Duplicate')
          .onClick(() => void this.callbacks.onDuplicate!());
      }
      const deleteButton = new ButtonComponent(secondaryButtonsContainer)
        .setButtonText('Delete')
        .onClick(() => void this.callbacks.onDelete!());
      deleteButton.buttonEl.addClass('better-recall-delete-button');
      this.renderButtonsBar(
        'Save',
        this.options.mode === 'edit' ? buttonsContainer : undefined,
      );
    } else {
      this.renderButtonsBar('Add');
    }
  }

  public getDeckId(): string {
    return this.deckDropdownComp.getValue();
  }

  public getFront(): string {
    return this.frontInputComp.getValue();
  }

  public getBack(): string {
    return this.backInputComp.getValue();
  }

  public clearInputs(): void {
    this.frontInputComp.setValue('');
    this.backInputComp.setValue('');
    this.buttonsBarComp.setSubmitButtonDisabled(true);
  }

  public cleanup(): void {
    this.cancelTranslation();
    this.frontInputComp.cleanup();
    this.backInputComp.cleanup();
  }

  private isTranslationCancelled(error: unknown): boolean {
    return (
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.message === 'Translation cancelled')
    );
  }

  private cancelTranslation(): void {
    this.translationAbortController?.abort();
    this.translationAbortController = null;
    this.translationRequestId += 1;
    this.setTranslatingUi(false);
  }

  private setTranslatingUi(translating: boolean): void {
    if (this.translateButtonComp) {
      this.translateButtonComp.setDisabled(translating);
      this.translateButtonComp.setButtonText(
        translating ? 'Translating...' : 'Translate',
      );
    }
    if (this.translateCancelButtonComp) {
      if (translating) {
        this.translateCancelButtonComp.buttonEl.show();
      } else {
        this.translateCancelButtonComp.buttonEl.hide();
      }
    }
    if (this.sourceLangDropdownComp) {
      this.sourceLangDropdownComp.setDisabled(translating);
    }
    if (this.targetLangDropdownComp) {
      this.targetLangDropdownComp.setDisabled(translating);
    }
  }

  private get disabled(): boolean {
    return (
      this.frontInputComp.getValue().length === 0 ||
      this.backInputComp.getValue().length === 0
    );
  }

  private handleInputChange(): void {
    const disabled =
      this.frontInputComp.getValue().length === 0 ||
      this.backInputComp.getValue().length === 0;
    this.buttonsBarComp.setSubmitButtonDisabled(disabled);
  }

  private async handleTranslate(): Promise<void> {
    const frontText = this.frontInputComp.getValue().trim();
    if (!frontText) return;
    const sourceLang = this.sourceLangDropdownComp?.getValue() || 'en';
    const targetLang = this.targetLangDropdownComp?.getValue() || 'es';
    if (sourceLang === targetLang) {
      new Notice('Source and target languages cannot be the same', 3000);
      return;
    }

    this.translationAbortController?.abort();
    const controller = new AbortController();
    this.translationAbortController = controller;
    const requestId = ++this.translationRequestId;
    this.setTranslatingUi(true);

    try {
      const translatedText = await translateText(frontText, {
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        signal: controller.signal,
      });
      if (requestId !== this.translationRequestId) {
        return;
      }
      this.backInputComp.setValue(translatedText);
      this.handleInputChange();
    } catch (error) {
      if (this.isTranslationCancelled(error)) {
        return;
      }
      const msg = error instanceof Error ? error.message : 'Translation failed';
      console.error('Translation error:', msg);
      new Notice(`Translation failed: ${msg}`, 5000);
    } finally {
      if (requestId === this.translationRequestId) {
        this.translationAbortController = null;
        this.setTranslatingUi(false);
      }
    }
  }

  private renderDeckDropdown(): void {
    const decks = Object.entries(this.plugin.decksManager.getDecks()).reduce<
      Record<string, string>
    >((curr, [id, deck]) => {
      curr[id] = deck.getName();
      return curr;
    }, {});

    this.optionsContainerEl.createEl('p', {
      text: 'Deck:',
      cls: cn(SETTING_ITEM_DESCRIPTION, CARD_MODAL_DESCRIPTION),
    });
    this.deckDropdownComp = new DropdownComponent(
      this.optionsContainerEl,
    ).addOptions(decks);

    const lastSelectedDeckId = this.plugin.getSettings().lastSelectedDeckId;
    const initialDeckId =
      this.options.mode === 'edit' && this.options.deck
        ? this.options.deck.id
        : lastSelectedDeckId;
    if (initialDeckId && decks[initialDeckId]) {
      this.deckDropdownComp.setValue(initialDeckId);
    }

    this.deckDropdownComp.selectEl.addClass('better-recall-field');
    this.deckDropdownComp.onChange((value) => {
      this.plugin.setLastSelectedDeckId(value);
      void this.plugin.savePluginData();
    });
  }

  private renderCardTypeDropdown(): void {
    this.optionsContainerEl.createEl('p', {
      text: 'Type:',
      cls: cn(SETTING_ITEM_DESCRIPTION, CARD_MODAL_DESCRIPTION),
    });
    const cardTypeDropdown = new DropdownComponent(this.optionsContainerEl)
      .addOptions({ basic: 'Basic' })
      .setDisabled(true);
    cardTypeDropdown.selectEl.addClass('better-recall-field');
  }

  private renderBasicTypeFields(front?: string, back?: string): void {
    const handleInputChange = () => this.handleInputChange();

    this.frontInputComp = new InputAreaComponent(this.containerEl, {
      description: 'Front',
      ensureVisibleOnFocus: true,
    })
      .setValue(front ?? '')
      .onChange(handleInputChange);
    this.frontInputComp.keyboardListener.onEnter = () => {
      if (this.disabled) return;
      void this.callbacks.onSubmit();
    };

    this.backInputComp = new InputAreaComponent(this.containerEl, {
      description: '',
      ensureVisibleOnFocus: true,
    })
      .setValue(back ?? '')
      .onChange(handleInputChange);

    this.backFieldLabelContainer = this.containerEl.createDiv(
      'better-recall-back-field-container',
    );
    this.containerEl.insertBefore(
      this.backFieldLabelContainer,
      this.backInputComp.inputEl,
    );

    const backDescriptionEl = this.backFieldLabelContainer.createEl('p', {
      text: 'Back',
      cls: cn(SETTING_ITEM_DESCRIPTION, CARD_MODAL_DESCRIPTION),
    });
    backDescriptionEl.addClass('better-recall-back-field');

    const translateControlsContainer = this.backFieldLabelContainer.createDiv(
      'better-recall-translate-controls-container',
    );
    const dropdownsRow = translateControlsContainer.createDiv(
      'better-recall-lang-dropdowns-row',
    );

    const sourceLangContainer = dropdownsRow.createDiv(
      'better-recall-lang-dropdown-container',
    );
    const savedSourceLang =
      this.plugin.getSettings().sourceLanguage ||
      DEFAULT_SETTINGS.sourceLanguage;
    this.sourceLangDropdownComp = new DropdownComponent(sourceLangContainer)
      .addOptions(LANGUAGES)
      .setValue(savedSourceLang);
    this.sourceLangDropdownComp.selectEl.addClass(
      'better-recall-lang-dropdown',
    );
    this.sourceLangDropdownComp.onChange((value) => {
      this.plugin.setSourceLanguage(value);
      void this.plugin.savePluginData();
    });

    const swapButtonContainer = dropdownsRow.createDiv(
      'better-recall-lang-swap-container',
    );
    const swapButton = new ButtonComponent(swapButtonContainer)
      .setButtonText('⇄')
      .setTooltip('Swap languages')
      .onClick(() => {
        const sourceValue = this.sourceLangDropdownComp?.getValue() || 'en';
        const targetValue = this.targetLangDropdownComp?.getValue() || 'es';
        this.sourceLangDropdownComp?.setValue(targetValue);
        this.targetLangDropdownComp?.setValue(sourceValue);
        this.plugin.setSourceLanguage(targetValue);
        this.plugin.setTargetLanguage(sourceValue);
        void this.plugin.savePluginData();
      });
    swapButton.buttonEl.addClass('better-recall-lang-swap-button');

    const targetLangContainer = dropdownsRow.createDiv(
      'better-recall-lang-dropdown-container',
    );
    const savedTargetLang =
      this.plugin.getSettings().targetLanguage ||
      DEFAULT_SETTINGS.targetLanguage;
    this.targetLangDropdownComp = new DropdownComponent(targetLangContainer)
      .addOptions(LANGUAGES)
      .setValue(savedTargetLang);
    this.targetLangDropdownComp.selectEl.addClass(
      'better-recall-lang-dropdown',
    );
    this.targetLangDropdownComp.onChange((value) => {
      this.plugin.setTargetLanguage(value);
      void this.plugin.savePluginData();
    });

    const translateButtonContainer = translateControlsContainer.createDiv(
      'better-recall-translate-button-container',
    );
    this.translateButtonComp = new ButtonComponent(translateButtonContainer)
      .setButtonText('Translate')
      .setTooltip('Translate text')
      .onClick(() => void this.handleTranslate());
    this.translateButtonComp.buttonEl.addClass(
      'better-recall-translate-button',
    );
    this.translateCancelButtonComp = new ButtonComponent(
      translateButtonContainer,
    )
      .setButtonText('Cancel')
      .setTooltip('Cancel translation')
      .onClick(() => this.cancelTranslation());
    this.translateCancelButtonComp.buttonEl.addClass(
      'better-recall-translate-cancel-button',
    );
    this.translateCancelButtonComp.buttonEl.hide();

    this.backInputComp.descriptionEl = backDescriptionEl;
    this.backInputComp.keyboardListener.onEnter = () => {
      if (this.disabled) return;
      void this.callbacks.onSubmit();
    };
  }

  private renderButtonsBar(
    submitText: string,
    buttonsContainer?: HTMLElement,
  ): void {
    const container = buttonsContainer ?? this.containerEl;
    this.buttonsBarComp = new ButtonsBarComponent(container)
      .setSubmitButtonDisabled(true)
      .setSubmitText(submitText)
      .setCloseButtonText('Back')
      .onClose(this.callbacks.onCancel);

    const submitButtonInBar =
      this.buttonsBarComp.buttonsBarEl.querySelector('button:last-child');
    if (submitButtonInBar) {
      (submitButtonInBar as HTMLElement).addClass(
        'better-recall--display-none',
      );
    }

    if (this.backFieldLabelContainer) {
      const submitButtonComp = new ButtonComponent(
        this.backFieldLabelContainer,
      );
      submitButtonComp.setButtonText(submitText);
      submitButtonComp.setCta();
      submitButtonComp.setDisabled(true);
      submitButtonComp.onClick(() => void this.callbacks.onSubmit());
      submitButtonComp.buttonEl.addClass('better-recall-submit-button');
      this.buttonsBarComp.setSubmitButtonDisabled = (disabled: boolean) => {
        submitButtonComp.setDisabled(disabled);
        return this.buttonsBarComp;
      };
      this.buttonsBarComp.setSubmitText = (text: string) => {
        submitButtonComp.setButtonText(text);
        return this.buttonsBarComp;
      };
    } else if (submitButtonInBar) {
      (submitButtonInBar as HTMLElement).removeClass(
        'better-recall--display-none',
      );
      this.buttonsBarComp.onSubmit(() => void this.callbacks.onSubmit());
    }
  }
}
