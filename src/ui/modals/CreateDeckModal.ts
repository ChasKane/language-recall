import { Modal } from 'obsidian';
import BetterRecallPlugin from 'src/main';
import { ButtonsBarComponent } from '../components/ButtonsBarComponent';
import { InputFieldComponent } from '../components/input/InputFieldComponent';

export class CreateDeckModal extends Modal {
  private deckNameInputComp: InputFieldComponent;
  private deckDescriptionInputComp: InputFieldComponent;
  private buttonsBarComp: ButtonsBarComponent;
  private resizeHandler: (() => void) | null = null;
  private focusHandler: ((e: FocusEvent) => void) | null = null;
  private readonly closeHandler = () => {
    this.close();
  };

  constructor(private plugin: BetterRecallPlugin) {
    super(plugin.app);
    this.setTitle('Create new deck');
  }

  private scrollInputIntoView(inputEl: HTMLElement): void {
    setTimeout(() => {
      const modalContent = this.contentEl.closest(
        '.modal-content',
      ) as HTMLElement;
      if (modalContent) {
        const inputRect = inputEl.getBoundingClientRect();
        const viewportHeight =
          window.visualViewport?.height || window.innerHeight;

        if (inputRect.bottom > viewportHeight - 20) {
          const scrollAmount = inputRect.bottom - viewportHeight + 40;
          modalContent.scrollTop += scrollAmount;
        }
      }
    }, 300);
  }

  onOpen(): void {
    super.onOpen();
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

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this.resizeHandler);
    }
    window.addEventListener('resize', this.resizeHandler);
    this.contentEl.addEventListener('focusin', this.focusHandler, true);
  }

  private render(): void {
    // Creates the deck name input field.
    this.deckNameInputComp = new InputFieldComponent(this.contentEl, {
      description: 'New deck name:',
    })
      .setPlaceholder('Algorithms & datastructures')
      .onChange((value) => {
        this.buttonsBarComp.setSubmitButtonDisabled(value.length === 0);
      });
    this.deckNameInputComp.keyboardListener.onEnter = () => {
      void this.createDeck();
    };
    this.deckNameInputComp.descriptionEl.addClass(
      'better-recall-deck-name-field',
    );

    // Creates the deck description input field.
    this.deckDescriptionInputComp = new InputFieldComponent(this.contentEl, {
      description: 'Description (optional):',
    }).setPlaceholder('A lovely CS learning experience.');
    this.deckDescriptionInputComp.keyboardListener.onEnter = () => {
      if (this.deckNameInputComp.getValue().length === 0) {
        return;
      }

      this.createDeck();
    };
    this.deckDescriptionInputComp.descriptionEl.addClass(
      'better-recall-deck-description-field',
    );

    // Creates the buttons bar.
    this.buttonsBarComp = new ButtonsBarComponent(this.contentEl)
      .setSubmitText('Create')
      .setSubmitButtonDisabled(true)
      .onClose(this.closeHandler)
      .onSubmit(() => {
        void this.createDeck();
      });
  }

  private async createDeck(): Promise<void> {
    this.buttonsBarComp.setSubmitButtonDisabled(true);
    const createdDeck = await this.plugin.decksManager.create(
      this.deckNameInputComp.getValue(),
      this.deckDescriptionInputComp.getValue(),
    );
    this.plugin.getEventEmitter().emit('addDeck', { deck: createdDeck });
    this.close();
  }

  onClose(): void {
    this.deckNameInputComp.keyboardListener.cleanup();
    this.deckDescriptionInputComp.keyboardListener.cleanup();

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
    this.contentEl.empty();
  }
}
