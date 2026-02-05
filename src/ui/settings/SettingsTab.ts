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
      .setName('Review Interval Multiplier')
      .setDesc('Adjust how often you see cards. Lower values = review sooner, Higher values = space out more.');

    const sliderContainer = multiplierSetting.controlEl.createDiv();
    sliderContainer.style.display = 'flex';
    sliderContainer.style.flexDirection = 'column';
    sliderContainer.style.gap = '8px';

    const sliderRow = sliderContainer.createDiv();
    sliderRow.style.display = 'flex';
    sliderRow.style.alignItems = 'center';
    sliderRow.style.gap = '12px';

    // Map multiplier (0.25-4.0) to slider (0-100)
    const MIN_MULTIPLIER = 0.25;
    const MAX_MULTIPLIER = 4.0;
    const multiplierToSlider = (mult: number): number => {
      return ((mult - MIN_MULTIPLIER) / (MAX_MULTIPLIER - MIN_MULTIPLIER)) * 100;
    };
    const sliderToMultiplier = (sliderVal: number): number => {
      return MIN_MULTIPLIER + (sliderVal / 100) * (MAX_MULTIPLIER - MIN_MULTIPLIER);
    };

    const currentMultiplier = this.plugin.getSettings().intervalMultiplier;
    const slider = sliderRow.createEl('input', {
      type: 'range',
      min: '0',
      max: '100',
      step: '1',
      value: multiplierToSlider(currentMultiplier).toString(),
    });
    slider.style.flex = '1';

    const valueDisplay = sliderRow.createSpan();
    valueDisplay.style.minWidth = '60px';
    valueDisplay.style.textAlign = 'right';
    valueDisplay.style.fontWeight = 'bold';
    valueDisplay.setText(currentMultiplier.toFixed(2));

    // Display calculated intervals
    const intervalsContainer = sliderContainer.createDiv();
    intervalsContainer.style.marginTop = '8px';
    intervalsContainer.style.padding = '8px';
    intervalsContainer.style.backgroundColor = 'var(--background-secondary)';
    intervalsContainer.style.borderRadius = '4px';
    intervalsContainer.style.fontSize = '0.9em';

    const updateIntervals = () => {
      const multiplier = sliderToMultiplier(parseFloat(slider.value));
      valueDisplay.setText(multiplier.toFixed(2));

      // Calculate intervals
      const hardInterval = (1 * multiplier).toFixed(1);
      const goodInterval = (7 * multiplier).toFixed(1);
      const easyInterval = (21 * multiplier).toFixed(1);

      intervalsContainer.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span>Hard:</span>
          <span style="font-weight: bold;">${hardInterval} days</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span>Good:</span>
          <span style="font-weight: bold;">${goodInterval} days</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Easy:</span>
          <span style="font-weight: bold;">${easyInterval} days</span>
        </div>
      `;
    };

    updateIntervals();

    slider.addEventListener('input', async () => {
      const multiplier = sliderToMultiplier(parseFloat(slider.value));
      updateIntervals();
      this.plugin.setIntervalMultiplier(multiplier);
      await this.plugin.savePluginData();
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
    const warningDesc = this.containerEl.createDiv();
    warningDesc.addClass('setting-item-description');
    warningDesc.style.color = 'var(--text-muted)';
    warningDesc.style.fontStyle = 'italic';
    warningDesc.style.marginTop = 'var(--size-2-1)';
    warningDesc.style.marginBottom = 'var(--size-4-3)';
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
      button.setButtonText('Save').setCta().onClick(async () => {
        if (!folderNameComponent) {
          return;
        }

        const newFolderName = folderNameComponent.getValue().trim();
        if (!newFolderName) {
          return;
        }

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
      });
    });
  }
}
