import {
  Setting,
  PluginSettingTab,
  TextComponent,
  ButtonComponent,
} from 'obsidian';
import BetterRecallPlugin from 'src/main';
import { DEFAULT_SETTINGS } from 'src/settings/data';
import {
  chatHistoryLimitFromSlider,
  chatHistorySliderFromLimit,
  describeChatHistoryLimit,
} from 'src/util/followup';

const DISK_SYNC_POLL_MS = 2000;

export class SettingsTab extends PluginSettingTab {
  private isVisible = false;
  private renderGeneration = 0;
  private diskPollTimer: number | null = null;

  constructor(private plugin: BetterRecallPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    this.isVisible = true;
    void this.reloadAndRender();
    this.startDiskPoll();
  }

  hide(): void {
    this.isVisible = false;
    this.stopDiskPoll();
  }

  /** Re-render when data.json changes while this tab is open (e.g. vault sync). */
  refreshIfVisible(): void {
    if (this.isVisible) {
      void this.reloadAndRender();
    }
  }

  private async reloadAndRender(): Promise<void> {
    const generation = ++this.renderGeneration;
    await this.plugin.reloadPluginData();
    if (!this.isVisible || generation !== this.renderGeneration) {
      return;
    }
    this.containerEl.empty();
    this.renderSettings();
  }

  private startDiskPoll(): void {
    this.stopDiskPoll();
    const windowEl = this.containerEl.ownerDocument.defaultView;
    if (!windowEl) {
      return;
    }
    this.diskPollTimer = windowEl.setInterval(() => {
      void this.syncFromDiskIfChanged();
    }, DISK_SYNC_POLL_MS);
  }

  private stopDiskPoll(): void {
    if (this.diskPollTimer === null) {
      return;
    }
    const windowEl = this.containerEl.ownerDocument.defaultView;
    windowEl?.clearInterval(this.diskPollTimer);
    this.diskPollTimer = null;
  }

  private async syncFromDiskIfChanged(): Promise<void> {
    if (!this.isVisible) {
      return;
    }
    const changed = await this.plugin.syncFromDiskIfChanged();
    if (!changed || !this.isVisible) {
      return;
    }
    const generation = ++this.renderGeneration;
    this.containerEl.empty();
    if (generation === this.renderGeneration) {
      this.renderSettings();
    }
  }

  private renderSettings(): void {
    // Interval multiplier setting with slider
    const multiplierSetting = new Setting(this.containerEl)
      .setName('Review interval multiplier')
      .setDesc(
        'Adjust how often you see cards. Lower values = review sooner, higher values = space out more.',
      );
    multiplierSetting.settingEl.addClass(
      'better-recall-settings__multiplier-setting',
    );

    const sliderContainer = multiplierSetting.settingEl.createDiv(
      'better-recall-settings__slider-container',
    );

    const sliderRow = sliderContainer.createDiv(
      'better-recall-settings__slider-row',
    );

    const MIN_MULTIPLIER = 0.25;
    const MAX_MULTIPLIER = 4.0;
    const MULTIPLIER_STEP = 0.05;
    const snapMultiplier = (value: number): number =>
      Math.round(value / MULTIPLIER_STEP) * MULTIPLIER_STEP;

    const currentMultiplier = this.plugin.getSettings().intervalMultiplier;
    const slider = sliderRow.createEl('input', {
      attr: {
        type: 'range',
        min: MIN_MULTIPLIER.toString(),
        max: MAX_MULTIPLIER.toString(),
        step: MULTIPLIER_STEP.toString(),
        value: snapMultiplier(currentMultiplier).toFixed(2),
      },
    });
    slider.addClass('better-recall-settings__slider');

    const valueDisplay = sliderRow.createSpan();
    valueDisplay.addClass('better-recall-settings__slider-value');
    valueDisplay.setText(currentMultiplier.toFixed(2));

    // Display calculated intervals
    const intervalsContainer = sliderContainer.createDiv(
      'better-recall-settings__intervals',
    );

    const hardRow = intervalsContainer.createDiv(
      'better-recall-settings__interval-row',
    );
    hardRow.createSpan({ text: 'Hard:' });
    const hardValue = hardRow.createSpan({
      cls: 'better-recall-settings__interval-value',
    });

    const goodRow = intervalsContainer.createDiv(
      'better-recall-settings__interval-row',
    );
    goodRow.createSpan({ text: 'Good:' });
    const goodValue = goodRow.createSpan({
      cls: 'better-recall-settings__interval-value',
    });

    const easyRow = intervalsContainer.createDiv(
      'better-recall-settings__interval-row',
    );
    easyRow.createSpan({ text: 'Easy:' });
    const easyValue = easyRow.createSpan({
      cls: 'better-recall-settings__interval-value',
    });

    const updateIntervals = () => {
      const multiplier = snapMultiplier(parseFloat(slider.value));
      valueDisplay.setText(multiplier.toFixed(2));

      // Calculate intervals
      const hardInterval = (1 * multiplier).toFixed(1);
      const goodInterval = (7 * multiplier).toFixed(1);
      const easyInterval = (21 * multiplier).toFixed(1);

      hardValue.setText(`${hardInterval} days`);
      goodValue.setText(`${goodInterval} days`);
      easyValue.setText(`${easyInterval} days`);
    };

    updateIntervals();

    slider.addEventListener('input', () => {
      const multiplier = snapMultiplier(parseFloat(slider.value));
      slider.value = multiplier.toFixed(2);
      updateIntervals();
      void (async () => {
        await this.plugin.setIntervalMultiplier(multiplier);
        await this.plugin.savePluginData();
      })();
    });

    const multiplierNote = sliderContainer.createDiv(
      'better-recall-settings__note setting-item-description',
    );
    multiplierNote.setText(
      'Changing this rescales every existing card proportionally: stored intervals and future due dates move with the ratio. Cards already due stay due. Future reviews use the new spacing.',
    );

    // Add a separator
    this.containerEl.createEl('hr');

    new Setting(this.containerEl)
      .setName('Gemini API key')
      .setDesc(
        'Used for follow-up chat during card review. Create a key at aistudio.Google.com/apikey. For desktop apps like Obsidian, set application restrictions to none.',
      )
      .addText((text) => {
        text
          .setPlaceholder('Paste API key')
          .setValue(this.plugin.getSettings().geminiApiKey)
          .onChange((value) => {
            this.plugin.setGeminiApiKey(value.trim());
            void this.plugin.savePluginData();
          });
        text.inputEl.type = 'password';
      });

    new Setting(this.containerEl)
      .setName('System prompt')
      .setDesc(
        "Optional instructions sent with every AI chat request (Gemini, groq, and openrouter). Use this for your target language, proficiency level, preferred explanation style, or other standing context. Your text is prepended to the plugin's built-in prompt for the current card.",
      )
      .addTextArea((text) => {
        text
          .setPlaceholder(
            'Example: I am learning portuguese at an intermediate level. Explain grammar briefly and give one short example sentence.',
          )
          .setValue(this.plugin.getSettings().systemPrompt)
          .onChange((value) => {
            this.plugin.setSystemPrompt(value);
            void this.plugin.savePluginData();
          });
        text.inputEl.rows = 4;
        text.inputEl.addClass('better-recall-settings__system-prompt');
      });

    const chatHistorySetting = new Setting(this.containerEl)
      .setName('Chat history sent to AI')
      .setDesc(
        'How much prior chat to include with each request. More history helps the AI stay on topic but increases token usage and cost. Long conversations can also degrade answer quality as older messages dilute the context.',
      );
    chatHistorySetting.settingEl.addClass(
      'better-recall-settings__chat-history-setting',
    );

    const chatHistoryContainer = chatHistorySetting.settingEl.createDiv(
      'better-recall-settings__slider-container',
    );

    const chatHistoryLabelRow = chatHistoryContainer.createDiv(
      'better-recall-settings__slider-labels',
    );
    chatHistoryLabelRow.createSpan({
      cls: 'better-recall-settings__slider-end-label',
      text: 'Only current message',
    });
    chatHistoryLabelRow.createSpan({
      cls: 'better-recall-settings__slider-end-label',
      text: 'Whole conversation',
    });

    const chatHistorySliderRow = chatHistoryContainer.createDiv(
      'better-recall-settings__slider-row',
    );

    const currentChatHistoryLimit =
      this.plugin.getSettings().chatHistoryLimit ??
      DEFAULT_SETTINGS.chatHistoryLimit;
    const chatHistorySlider = chatHistorySliderRow.createEl('input', {
      attr: {
        type: 'range',
        min: '0',
        max: '100',
        step: '1',
        value: chatHistorySliderFromLimit(currentChatHistoryLimit).toString(),
      },
    });
    chatHistorySlider.addClass('better-recall-settings__slider');

    const chatHistoryValueDisplay = chatHistorySliderRow.createSpan();
    chatHistoryValueDisplay.addClass('better-recall-settings__slider-value');

    const updateChatHistoryDisplay = () => {
      const limit = chatHistoryLimitFromSlider(
        parseInt(chatHistorySlider.value, 10),
      );
      chatHistoryValueDisplay.setText(describeChatHistoryLimit(limit));
    };

    updateChatHistoryDisplay();

    chatHistorySlider.addEventListener('input', () => {
      updateChatHistoryDisplay();
      const limit = chatHistoryLimitFromSlider(
        parseInt(chatHistorySlider.value, 10),
      );
      this.plugin.setChatHistoryLimit(limit);
      void this.plugin.savePluginData();
    });

    new Setting(this.containerEl)
      .setName('Groq API key (optional fallback)')
      .setDesc(
        'Used automatically if Gemini fails. Free at console.groq.com. You can also add this when prompted during chat.',
      )
      .addText((text) => {
        text
          .setPlaceholder('Paste API key')
          .setValue(this.plugin.getSettings().groqApiKey)
          .onChange((value) => {
            this.plugin.setGroqApiKey(value.trim());
            void this.plugin.savePluginData();
          });
        text.inputEl.type = 'password';
      });

    new Setting(this.containerEl)
      .setName('Openrouter API key (optional fallback)')
      .setDesc(
        'Last-resort fallback if Gemini and groq fail. Free at openrouter.ai/keys.',
      )
      .addText((text) => {
        text
          .setPlaceholder('Paste API key')
          .setValue(this.plugin.getSettings().openRouterApiKey)
          .onChange((value) => {
            this.plugin.setOpenRouterApiKey(value.trim());
            void this.plugin.savePluginData();
          });
        text.inputEl.type = 'password';
      });

    // Add a separator
    this.containerEl.createEl('hr');

    // Decks folder name setting
    let folderNameComponent: TextComponent | null = null;
    const folderNameSetting = new Setting(this.containerEl)
      .setName('Folder name for decks')
      .setDesc(
        'The name of the folder where deck files are stored. Click save to rename the folder and move all existing decks.',
      );

    // Warning about file names
    const warningDesc = this.containerEl.createDiv(
      'better-recall-settings__warning setting-item-description',
    );
    warningDesc.addClass('setting-item-description');
    warningDesc.setText(
      'Please do not manually rename or move individual deck files. Only change the folder name using this setting. The plugin manages file names automatically.',
    );

    folderNameSetting.addText((text) => {
      folderNameComponent = text;
      const currentFolderName =
        this.plugin.getSettings().decksFolderName ||
        DEFAULT_SETTINGS.decksFolderName;
      text.setValue(currentFolderName);
      text.setPlaceholder('Language recall');
    });

    folderNameSetting.addButton((button: ButtonComponent) => {
      button
        .setButtonText('Save')
        .setCta()
        .onClick(() => {
          if (!folderNameComponent) {
            return;
          }

          const newFolderName = folderNameComponent.getValue().trim();
          if (!newFolderName) {
            return;
          }

          void (async () => {
            try {
              // Rename the folder and move all deck files
              await this.plugin.decksManager.renameDecksFolder(newFolderName);
              // Update the setting
              this.plugin.setDecksFolderName(newFolderName);
              await this.plugin.savePluginData();

              // Show success message
              button.setButtonText('Saved!');
              const windowEl = button.buttonEl.ownerDocument.defaultView;
              windowEl?.setTimeout(() => {
                button.setButtonText('Save');
              }, 2000);
            } catch (error) {
              console.error('Failed to rename decks folder:', error);
              button.setButtonText('Error');
              const windowEl = button.buttonEl.ownerDocument.defaultView;
              windowEl?.setTimeout(() => {
                button.setButtonText('Save');
              }, 2000);
            }
          })();
        });
    });
  }
}
