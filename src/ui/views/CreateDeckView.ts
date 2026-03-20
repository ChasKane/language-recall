import { RecallSubView } from './SubView';
import BetterRecallPlugin from 'src/main';
import { RecallView } from '.';
import { ButtonsBarComponent } from '../components/ButtonsBarComponent';
import { InputFieldComponent } from '../components/input/InputFieldComponent';

export class CreateDeckView extends RecallSubView {
  private rootEl: HTMLElement;
  private deckNameInputComp: InputFieldComponent;
  private deckDescriptionInputComp: InputFieldComponent;
  private buttonsBarComp: ButtonsBarComponent;

  constructor(
    protected readonly plugin: BetterRecallPlugin,
    protected readonly recallView: RecallView,
  ) {
    super(plugin, recallView);
  }

  public render(): void {
    this.rootEl = this.recallView.rootEl.createDiv(
      'better-recall-create-deck-view',
    );
    this.renderBackButton(this.rootEl);

    this.deckNameInputComp = new InputFieldComponent(this.rootEl, {
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

    this.deckDescriptionInputComp = new InputFieldComponent(this.rootEl, {
      description: 'Description (optional):',
    }).setPlaceholder('A lovely cs learning experience.');
    this.deckDescriptionInputComp.keyboardListener.onEnter = () => {
      if (this.deckNameInputComp.getValue().length === 0) return;
      void this.createDeck();
    };
    this.deckDescriptionInputComp.descriptionEl.addClass(
      'better-recall-deck-description-field',
    );

    this.buttonsBarComp = new ButtonsBarComponent(this.rootEl)
      .setSubmitText('Create')
      .setSubmitButtonDisabled(true)
      .setCloseButtonText('Back')
      .onClose(() => this.recallView.goBackFromCreateDeck())
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
    this.recallView.goBackFromCreateDeck();
  }

  public onClose(): void {
    this.deckNameInputComp?.keyboardListener?.cleanup();
    this.deckDescriptionInputComp?.keyboardListener?.cleanup();
  }
}
