import { App, Modal, Setting } from 'obsidian';
import { FallbackProvider } from 'src/util/followup-send';

const PROVIDER_COPY: Record<
  FallbackProvider,
  { title: string; description: string; placeholder: string; url: string }
> = {
  groq: {
    title: 'Groq API key needed',
    description:
      'Gemini failed. Add a free Groq key to keep chatting. Create one at console.groq.com (no credit card required).',
    placeholder: 'gsk_…',
    url: 'https://console.groq.com/keys',
  },
  openrouter: {
    title: 'OpenRouter API key needed',
    description:
      'Gemini and Groq failed. Add a free OpenRouter key as a last resort. Create one at openrouter.ai/keys.',
    placeholder: 'sk-or-…',
    url: 'https://openrouter.ai/keys',
  },
};

export class FallbackApiKeyModal extends Modal {
  private apiKey = '';
  private resolved = false;

  constructor(
    app: App,
    private readonly provider: FallbackProvider,
    private readonly onSubmit: (apiKey: string) => void,
    private readonly onCancel: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const copy = PROVIDER_COPY[this.provider];
    this.setTitle(copy.title);
    this.contentEl.createEl('p', {
      cls: 'better-recall-fallback-key-modal__description',
      text: copy.description,
    });

    new Setting(this.contentEl)
      .setName('API key')
      .setDesc(`Get a key at ${copy.url}`)
      .addText((text) => {
        text
          .setPlaceholder(copy.placeholder)
          .onChange((value) => {
            this.apiKey = value.trim();
          });
        text.inputEl.type = 'password';
        text.inputEl.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            this.submit();
          }
        });
      });

    const buttonRow = this.contentEl.createDiv(
      'better-recall-fallback-key-modal__buttons',
    );

    new Setting(buttonRow)
      .addButton((button) => {
        button.setButtonText('Continue').setCta().onClick(() => this.submit());
      })
      .addButton((button) => {
        button.setButtonText('Skip').onClick(() => this.cancel());
      });
  }

  onClose(): void {
    if (!this.resolved) {
      this.onCancel();
    }
    this.contentEl.empty();
  }

  private submit(): void {
    if (!this.apiKey) {
      return;
    }

    this.resolved = true;
    this.onSubmit(this.apiKey);
    this.close();
  }

  private cancel(): void {
    this.resolved = true;
    this.onCancel();
    this.close();
  }
}

export function promptFallbackApiKey(
  app: App,
  provider: FallbackProvider,
): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = new FallbackApiKeyModal(
      app,
      provider,
      (apiKey) => resolve(apiKey),
      () => resolve(null),
    );
    modal.open();
  });
}
