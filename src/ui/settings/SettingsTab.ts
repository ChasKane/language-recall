import {
  Setting,
  PluginSettingTab,
  TextComponent,
  ButtonComponent,
} from 'obsidian';
import BetterRecallPlugin from 'src/main';
import { DEFAULT_SETTINGS } from 'src/settings/data';

export class SettingsTab extends PluginSettingTab {
  constructor(private plugin: BetterRecallPlugin) {
    super(plugin.app, plugin);
  }

  display() {
    this.containerEl.empty();

    // Interval multiplier setting with slider
    const multiplierSetting = new Setting(this.containerEl)
      .setName('Review interval multiplier')
      .setDesc(
        'Adjust how often you see cards. Lower values = review sooner, higher values = space out more.',
      );

    const sliderContainer = multiplierSetting.controlEl.createDiv(
      'better-recall-settings__slider-container',
    );

    const sliderRow = sliderContainer.createDiv(
      'better-recall-settings__slider-row',
    );

    // Map multiplier (0.25-4.0) to slider (0-100)
    const MIN_MULTIPLIER = 0.25;
    const MAX_MULTIPLIER = 4.0;
    const multiplierToSlider = (mult: number): number => {
      return (
        ((mult - MIN_MULTIPLIER) / (MAX_MULTIPLIER - MIN_MULTIPLIER)) * 100
      );
    };
    const sliderToMultiplier = (sliderVal: number): number => {
      return (
        MIN_MULTIPLIER + (sliderVal / 100) * (MAX_MULTIPLIER - MIN_MULTIPLIER)
      );
    };

    const currentMultiplier = this.plugin.getSettings().intervalMultiplier;
    const slider = sliderRow.createEl('input', {
      attr: {
        type: 'range',
        min: '0',
        max: '100',
        step: '1',
        value: multiplierToSlider(currentMultiplier).toString(),
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
      const multiplier = sliderToMultiplier(parseFloat(slider.value));
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
      const multiplier = sliderToMultiplier(parseFloat(slider.value));
      updateIntervals();
      this.plugin.setIntervalMultiplier(multiplier);
      void this.plugin.savePluginData();
    });

    // Add a separator
    this.containerEl.createEl('hr');

    // Decks folder name setting
    let folderNameComponent: TextComponent | null = null;
    const folderNameSetting = new Setting(this.containerEl)
      .setName('Decks folder name')
      .setDesc(
        'The name of the folder where deck files are stored. Click "Save" to rename the folder and move all existing decks.',
      );

    // Warning about file names
    const warningDesc = this.containerEl.createDiv(
      'better-recall-settings__warning setting-item-description',
    );
    warningDesc.addClass('setting-item-description');
    warningDesc.setText(
      '⚠️ Please do not manually rename or move individual deck files. Only change the folder name using this setting. The plugin manages file names automatically.',
    );

    folderNameSetting.addText((text) => {
      folderNameComponent = text;
      const currentFolderName =
        this.plugin.getSettings().decksFolderName ||
        DEFAULT_SETTINGS.decksFolderName;
      text.setValue(currentFolderName);
      text.setPlaceholder('Language Recall');
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
              setTimeout(() => {
                button.setButtonText('Save');
              }, 2000);
            } catch (error) {
              console.error('Failed to rename decks folder:', error);
              button.setButtonText('Error');
              setTimeout(() => {
                button.setButtonText('Save');
              }, 2000);
            }
          })();
        });
    });
  }
}
