import { ButtonComponent, Modal } from 'obsidian';
import { Deck } from '../../data/deck';
import BetterRecallPlugin from '../../main';
import { ButtonsBarComponent } from '../components/ButtonsBarComponent';
import { InputFieldComponent } from '../components/input/InputFieldComponent';

export class EditDeckModal extends Modal {
  private buttonsBarComp: ButtonsBarComponent;
  private deckNameInputComp: InputFieldComponent;
  private deckDescriptionInputComp: InputFieldComponent;
  private resizeHandler: (() => void) | null = null;
  private focusHandler: ((e: FocusEvent) => void) | null = null;

  constructor(
    private plugin: BetterRecallPlugin,
    private deck: Deck,
  ) {
    super(plugin.app);
    this.setTitle(`Edit deck "${deck.getName()}"`);
  }

  private scrollInputIntoView(inputEl: HTMLElement): void {
    setTimeout(() => {
      const modalContent = this.contentEl.closest('.modal-content') as HTMLElement;
      if (modalContent) {
        const inputRect = inputEl.getBoundingClientRect();
        const viewportHeight = window.visualViewport?.height || window.innerHeight;
        
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
        (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT') &&
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
    // Renders the deck name input field.
    this.deckNameInputComp = new InputFieldComponent(this.contentEl, {
      description: 'Deck name:',
    })
      .setValue(this.deck.getName())
      .onChange((value) => {
        this.buttonsBarComp.setSubmitButtonDisabled(value.length === 0);
      });
    this.deckNameInputComp.keyboardListener.onEnter = () => {
      if (this.saveButtonDisabled) {
        return;
      }

      this.editDeck();
    };
    this.deckNameInputComp.descriptionEl.addClass(
      'better-recall-deck-name-field',
    );

    // Renders the deck description input field.
    this.deckDescriptionInputComp = new InputFieldComponent(this.contentEl, {
      description: 'Deck description:',
    }).setValue(this.deck.getDescription());
    this.deckDescriptionInputComp.keyboardListener.onEnter = () => {
      if (this.saveButtonDisabled) {
        return;
      }

      this.editDeck();
    };
    this.deckDescriptionInputComp.descriptionEl.addClass(
      'better-recall-deck-description-field',
    );

    const buttonsContainer = this.contentEl.createDiv(
      'better-recall__buttons-container',
    );
    // Create custom delete button.
    const deleteButton = new ButtonComponent(buttonsContainer)
      .setButtonText('Delete')
      .onClick(() => this.deleteDeck());
    deleteButton.buttonEl.addClass('better-recall-delete-button');

    // Renders the button bar.
    this.buttonsBarComp = new ButtonsBarComponent(buttonsContainer)
      .setSubmitText('Save')
      .setSubmitButtonDisabled(false)
      .onClose(this.close.bind(this))
      .onSubmit(async () => {
        if (this.deckNameInputComp.getValue().length === 0) {
          return;
        }

        await this.editDeck();
      });
  }

  private async deleteDeck(): Promise<void> {
    this.buttonsBarComp.setSubmitButtonDisabled(true);
    await this.plugin.decksManager.delete(this.deck.id);
    this.plugin.getEventEmitter().emit('deleteDeck', { deck: this.deck });
    this.close();
  }

  private async editDeck(): Promise<void> {
    this.buttonsBarComp.setSubmitButtonDisabled(true);
    await this.plugin.decksManager.updateInformation(
      this.deck.id,
      this.deckNameInputComp.getValue(),
      this.deckDescriptionInputComp.getValue(),
    );
    this.plugin.getEventEmitter().emit('editDeck', { deck: this.deck });
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

  protected get saveButtonDisabled(): boolean {
    return this.deckNameInputComp.getValue().length === 0;
  }
}
