export class KeyboardListener {
  private readonly onEnterPressHandler = (event: KeyboardEvent) => {
    this.onEnterPress(event);
  };

  constructor(
    private readonly inputEl: HTMLInputElement | HTMLTextAreaElement,
  ) {}

  public onEnter(): void {}

  public cleanup(): void {
    this.removeKeyEnterAction();
  }

  public addKeyEnterAction(): void {
    this.inputEl.addEventListener('keypress', this.onEnterPressHandler);
  }

  public removeKeyEnterAction(): void {
    this.inputEl.removeEventListener('keypress', this.onEnterPressHandler);
  }

  private onEnterPress(event: KeyboardEvent): void {
    const windowEl = this.inputEl.ownerDocument.defaultView;
    windowEl?.setTimeout(() => {
      const isEmpty = this.inputEl.value.length === 0;

      if (!event.altKey || event.key !== 'Enter' || isEmpty) {
        return;
      }

      this.onEnter();
    }, 1);
  }
}
