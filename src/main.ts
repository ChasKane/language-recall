import { Plugin } from 'obsidian';
import { registerCommands } from './commands';
import {
  BetterRecallData,
  BetterRecallSettings,
  DEFAULT_SETTINGS,
} from './settings/data';
import { FILE_VIEW_TYPE, RecallView } from './ui/views';
import { DecksManager } from './data/manager/decks-manager';
import { EventEmitter } from './data/event';
import { AnkiAlgorithm } from './spaced-repetition/anki';
import { SettingsTab } from './ui/settings/SettingsTab';

export default class BetterRecallPlugin extends Plugin {
  public readonly algorithm = new AnkiAlgorithm();
  public readonly decksManager = new DecksManager(this, this.algorithm);

  private data: BetterRecallData;
  private eventEmitter: EventEmitter;

  async onload() {
    this.eventEmitter = new EventEmitter();

    await this.loadPluginData();
    this.algorithm.setParameters(this.getSettings().intervalMultiplier);
    await this.decksManager.load();

    this.registerView(FILE_VIEW_TYPE, (leaf) => new RecallView(this, leaf));
    registerCommands(this);

    this.addRibbonIcon('wallet-cards', 'Open decks', () => {
      this.openRecallView();
    });

    this.addSettingTab(new SettingsTab(this));
  }

  onunload() {}

  /**
   * Opens the recall view of the plugin which displays all possible decks.
   */
  public openRecallView(): void {
    const leaf = this.app.workspace.getLeaf(false);
    void leaf.setViewState({
      type: FILE_VIEW_TYPE,
      state: {},
    });
    this.app.workspace.setActiveLeaf(leaf);
  }

  /**
   * Opens recall in a newly created leaf with explicit navigation state.
   */
  public async openRecallViewInNewLeaf(
    state: Record<string, unknown>,
  ): Promise<void> {
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({
      type: FILE_VIEW_TYPE,
      state,
    });
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }

  /**
   * Opens the recall view and navigates to the add-card editor (for the "Add card" command).
   */
  public async openRecallViewAndAddCard(): Promise<void> {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: FILE_VIEW_TYPE,
      state: {},
    });
    this.app.workspace.setActiveLeaf(leaf);
    const view = leaf.view;
    if (view?.getViewType?.() === FILE_VIEW_TYPE) {
      (view as RecallView).openCardEditorView();
    }
  }

  /**
   * Loads and initializes the data including the settings for the plugin.
   * First, it loads the existing data from the plugin and then checks for any missing
   * settings and applies default values where necessary.
   * Finally, it populates the `data` property with this loaded data.
   * @returns Promise that resolves when the settings have been loaded and initialized.
   */
  private async loadPluginData(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<BetterRecallData> | null;
    this.data = {
      settings: { ...DEFAULT_SETTINGS, ...(loaded?.settings ?? {}) },
    };
  }

  public getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }

  public getSettings(): BetterRecallSettings {
    return this.data.settings;
  }

  public setIntervalMultiplier(multiplier: number): void {
    this.getSettings().intervalMultiplier = multiplier;
    this.algorithm.setParameters(multiplier);
  }

  public setDecksFolderName(folderName: string): void {
    this.getSettings().decksFolderName = folderName;
  }

  public setSourceLanguage(language: string): void {
    this.getSettings().sourceLanguage = language;
  }

  public setTargetLanguage(language: string): void {
    this.getSettings().targetLanguage = language;
  }

  public setLastSelectedDeckId(deckId: string): void {
    this.getSettings().lastSelectedDeckId = deckId;
  }

  public getData(): BetterRecallData {
    return this.data;
  }

  public async savePluginData(): Promise<void> {
    await this.saveData(this.data);
  }
}
