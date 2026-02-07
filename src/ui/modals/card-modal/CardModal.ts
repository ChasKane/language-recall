import { ButtonComponent, DropdownComponent, Modal, Notice } from 'obsidian';
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

export abstract class CardModal extends Modal {
  private optionsContainerEl: HTMLElement;
  private resizeHandler: (() => void) | null = null;
  private focusHandler: ((e: FocusEvent) => void) | null = null;
  private readonly handleInputChangeHandler = () => {
    this.handleInputChange();
  };
  private readonly handleTranslateHandler = () => {
    void this.handleTranslate();
  };
  private readonly closeHandler = () => {
    this.close();
  };

  protected deckDropdownComp: DropdownComponent;
  protected frontInputComp: InputAreaComponent;
  protected backInputComp: InputAreaComponent;
  protected buttonsBarComp: ButtonsBarComponent;
  protected translateButtonComp: ButtonComponent | null = null;
  protected sourceLangDropdownComp: DropdownComponent | null = null;
  protected targetLangDropdownComp: DropdownComponent | null = null;
  protected backFieldLabelContainer: HTMLElement | null = null;

  constructor(protected plugin: BetterRecallPlugin) {
    super(plugin.app);
  }

  private scrollInputIntoView(inputEl: HTMLElement): void {
    // Small delay to ensure keyboard animation has started
    setTimeout(() => {
      const modalContent = this.contentEl.closest(
        '.modal-content',
      ) as HTMLElement;
      if (modalContent) {
        const inputRect = inputEl.getBoundingClientRect();
        const viewportHeight =
          window.visualViewport?.height || window.innerHeight;

        // Check if input is below the visible area
        if (inputRect.bottom > viewportHeight - 20) {
          const scrollAmount = inputRect.bottom - viewportHeight + 40;
          modalContent.scrollTop += scrollAmount;
        }
      }
    }, 300);
  }

  onOpen(): void {
    super.onOpen();

    this.optionsContainerEl = this.contentEl.createDiv(
      'better-recall-card__add-options',
    );

    this.render();

    // Add handlers for mobile keyboard
    this.resizeHandler = () => {
      const activeElement = document.activeElement as HTMLElement;
      if (
        activeElement &&
        (activeElement.tagName === 'TEXTAREA' ||
          activeElement.tagName === 'INPUT') &&
        this.contentEl.contains(activeElement)
      ) {
        this.scrollInputIntoView(activeElement);
      }
    };

    this.focusHandler = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')
      ) {
        this.scrollInputIntoView(target);
      }
    };

    // Listen for viewport resize (keyboard appearing/disappearing)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this.resizeHandler);
    }
    window.addEventListener('resize', this.resizeHandler);

    // Listen for focus events on inputs
    this.contentEl.addEventListener('focusin', this.focusHandler, true);
  }

  onClose(): void {
    this.frontInputComp.keyboardListener.cleanup();
    this.backInputComp.keyboardListener.cleanup();

    // Clean up mobile keyboard handlers
    if (this.resizeHandler) {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', this.resizeHandler);
      }
      window.removeEventListener('resize', this.resizeHandler);
    }
    if (this.focusHandler) {
      this.contentEl.removeEventListener('focusin', this.focusHandler, true);
    }

    super.onClose();
    // Cards are saved immediately when added/updated/removed, so no need to save here
    this.contentEl.empty();
  }

  protected abstract render(): void;

  protected abstract submit(): void | Promise<void>;

  protected renderDeckDropdown(): void {
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

    // Set to last selected deck if available and valid
    const lastSelectedDeckId = this.plugin.getSettings().lastSelectedDeckId;
    if (lastSelectedDeckId && decks[lastSelectedDeckId]) {
      this.deckDropdownComp.setValue(lastSelectedDeckId);
    }

    this.deckDropdownComp.selectEl.addClass('better-recall-field');
    this.deckDropdownComp.onChange((value) => {
      this.plugin.setLastSelectedDeckId(value);
      void this.plugin.savePluginData();
    });
  }

  protected renderCardTypeDropdown(): void {
    this.optionsContainerEl.createEl('p', {
      text: 'Type:',
      cls: cn(SETTING_ITEM_DESCRIPTION, CARD_MODAL_DESCRIPTION),
    });
    const cardTypeDropdown = new DropdownComponent(this.optionsContainerEl)
      .addOptions({ basic: 'Basic' })
      .setDisabled(true);
    cardTypeDropdown.selectEl.addClass('better-recall-field');
  }

  protected renderBasicTypeFields(front?: string, back?: string): void {
    this.frontInputComp = new InputAreaComponent(this.contentEl, {
      description: 'Front',
    })
      .setValue(front ?? '')
      .onChange(this.handleInputChangeHandler);
    this.frontInputComp.keyboardListener.onEnter = () => {
      if (this.disabled) {
        return;
      }

      void this.submit();
    };

    this.backInputComp = new InputAreaComponent(this.contentEl, {
      description: '',
    })
      .setValue(back ?? '')
      .onChange(this.handleInputChangeHandler);

    this.backFieldLabelContainer = this.contentEl.createDiv(
      'better-recall-back-field-container',
    );
    this.contentEl.insertBefore(
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

    const languageOptions: Record<string, string> = {
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      pt: 'Portuguese',
      ru: 'Russian',
      ja: 'Japanese',
      ko: 'Korean',
      zh: 'Chinese',
      ar: 'Arabic',
      nl: 'Dutch',
      pl: 'Polish',
      tr: 'Turkish',
      sv: 'Swedish',
      da: 'Danish',
      fi: 'Finnish',
      no: 'Norwegian',
      cs: 'Czech',
      hu: 'Hungarian',
      ro: 'Romanian',
      el: 'Greek',
      he: 'Hebrew',
      hi: 'Hindi',
      th: 'Thai',
      vi: 'Vietnamese',
    };

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
      .addOptions(languageOptions)
      .setValue(savedSourceLang);
    this.sourceLangDropdownComp.selectEl.addClass(
      'better-recall-lang-dropdown',
    );
    this.sourceLangDropdownComp.onChange((value) => {
      this.plugin.setSourceLanguage(value);
      void this.plugin.savePluginData();
    });

    // Swap button container
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
        // Save swapped values
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
      .addOptions(languageOptions)
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
      .onClick(this.handleTranslateHandler);
    this.translateButtonComp.buttonEl.addClass(
      'better-recall-translate-button',
    );

    this.backInputComp.descriptionEl = backDescriptionEl;

    this.backInputComp.keyboardListener.onEnter = () => {
      if (this.disabled) {
        return;
      }

      void this.submit();
    };
  }

  protected async handleTranslate(): Promise<void> {
    const frontText = this.frontInputComp.getValue().trim();

    if (!frontText) {
      return;
    }

    const sourceLang = this.sourceLangDropdownComp?.getValue() || 'en';
    const targetLang = this.targetLangDropdownComp?.getValue() || 'es';

    if (sourceLang === targetLang) {
      new Notice('Source and target languages cannot be the same', 3000);
      return;
    }

    if (this.translateButtonComp) {
      this.translateButtonComp.setDisabled(true);
      this.translateButtonComp.setButtonText('Translating...');
    }
    if (this.sourceLangDropdownComp) {
      this.sourceLangDropdownComp.setDisabled(true);
    }
    if (this.targetLangDropdownComp) {
      this.targetLangDropdownComp.setDisabled(true);
    }

    try {
      const translatedText = await translateText(frontText, {
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
      });
      this.backInputComp.setValue(translatedText);
      this.handleInputChange();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Translation failed';
      console.error('Translation error:', errorMessage);
      new Notice(`Translation failed: ${errorMessage}`, 5000);
    } finally {
      if (this.translateButtonComp) {
        this.translateButtonComp.setDisabled(false);
        this.translateButtonComp.setButtonText('Translate');
      }
      if (this.sourceLangDropdownComp) {
        this.sourceLangDropdownComp.setDisabled(false);
      }
      if (this.targetLangDropdownComp) {
        this.targetLangDropdownComp.setDisabled(false);
      }
    }
  }

  protected renderButtonsBar(
    submitText: string,
    options: { container?: HTMLElement } = {},
  ): void {
    options.container ??= this.contentEl;

    this.buttonsBarComp = new ButtonsBarComponent(options.container)
      .setSubmitButtonDisabled(true)
      .setSubmitText(submitText)
      .onClose(this.closeHandler);

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
      submitButtonComp.onClick(() => {
        void this.submit();
      });
      submitButtonComp.buttonEl.addClass('better-recall-submit-button');

      this.buttonsBarComp.setSubmitButtonDisabled = (disabled: boolean) => {
        submitButtonComp.setDisabled(disabled);
        return this.buttonsBarComp;
      };

      this.buttonsBarComp.setSubmitText = (text: string) => {
        submitButtonComp.setButtonText(text);
        return this.buttonsBarComp;
      };
    } else {
      if (submitButtonInBar) {
        (submitButtonInBar as HTMLElement).removeClass(
          'better-recall--display-none',
        );
        this.buttonsBarComp.onSubmit(() => {
          void this.submit();
        });
      }
    }
  }

  protected handleInputChange() {
    const disabled =
      this.frontInputComp.getValue().length === 0 ||
      this.backInputComp.getValue().length === 0;
    this.buttonsBarComp.setSubmitButtonDisabled(disabled);
  }

  protected get disabled(): boolean {
    return (
      this.frontInputComp.getValue().length === 0 ||
      this.backInputComp.getValue().length === 0
    );
  }
}
