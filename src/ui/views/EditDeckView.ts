import { ButtonComponent } from 'obsidian';
import { RecallSubView } from './SubView';
import BetterRecallPlugin from 'src/main';
import { RecallView } from '.';
import { Deck } from 'src/data/deck';
import { ButtonsBarComponent } from '../components/ButtonsBarComponent';
import { InputFieldComponent } from '../components/input/InputFieldComponent';

export class EditDeckView extends RecallSubView {
  private rootEl: HTMLElement;
  private deck: Deck;
  private deckNameInputComp: InputFieldComponent;
  private deckDescriptionInputComp: InputFieldComponent;
  private buttonsBarComp: ButtonsBarComponent;

  constructor(
    protected readonly plugin: BetterRecallPlugin,
    protected readonly recallView: RecallView,
  ) {
    super(plugin, recallView);
  }

  public setDeck(deck: Deck): void {
    this.deck = deck;
  }

  public render(): void {
    this.rootEl = this.recallView.rootEl.createDiv(
      'better-recall-edit-deck-view',
    );
    this.renderBackButton(this.rootEl);

    this.deckNameInputComp = new InputFieldComponent(this.rootEl, {
      description: 'Deck name:',
    })
      .setValue(this.deck.getName())
      .onChange(() => {
        this.buttonsBarComp.setSubmitButtonDisabled(this.saveButtonDisabled);
      });
    this.deckNameInputComp.keyboardListener.onEnter = () => {
      if (!this.saveButtonDisabled) void this.editDeck();
    };
    this.deckNameInputComp.descriptionEl.addClass(
      'better-recall-deck-name-field',
    );

    this.deckDescriptionInputComp = new InputFieldComponent(this.rootEl, {
      description: 'Deck description:',
    }).setValue(this.deck.getDescription());
    this.deckDescriptionInputComp.keyboardListener.onEnter = () => {
      if (!this.saveButtonDisabled) void this.editDeck();
    };
    this.deckDescriptionInputComp.descriptionEl.addClass(
      'better-recall-deck-description-field',
    );

    const buttonsContainer = this.rootEl.createDiv(
      'better-recall__buttons-container',
    );
    const deleteButton = new ButtonComponent(buttonsContainer)
      .setButtonText('Delete')
      .onClick(() => {
        void this.deleteDeck();
      });
    deleteButton.buttonEl.addClass('better-recall-delete-button');

    this.buttonsBarComp = new ButtonsBarComponent(buttonsContainer)
      .setSubmitText('Save')
      .setSubmitButtonDisabled(false)
      .setCloseButtonText('Back')
      .onClose(() => this.recallView.goBackFromEditDeck())
      .onSubmit(() => {
        if (this.deckNameInputComp.getValue().length === 0) return;
        void this.editDeck();
      });
  }

  private get saveButtonDisabled(): boolean {
    return this.deckNameInputComp?.getValue()?.length === 0;
  }

  private async editDeck(): Promise<void> {
    this.buttonsBarComp.setSubmitButtonDisabled(true);
    await this.plugin.decksManager.updateInformation(
      this.deck.id,
      this.deckNameInputComp.getValue(),
      this.deckDescriptionInputComp.getValue(),
    );
    this.plugin.getEventEmitter().emit('editDeck', { deck: this.deck });
    this.recallView.goBackFromEditDeck();
  }

  private async deleteDeck(): Promise<void> {
    this.buttonsBarComp.setSubmitButtonDisabled(true);
    await this.plugin.decksManager.delete(this.deck.id);
    this.plugin.getEventEmitter().emit('deleteDeck', { deck: this.deck });
    this.recallView.goBackFromEditDeck();
  }

  public onClose(): void {
    this.deckNameInputComp?.keyboardListener?.cleanup();
    this.deckDescriptionInputComp?.keyboardListener?.cleanup();
  }
}
