import { Plugin } from 'obsidian';
import { registerCommands } from './commands';
import {
  BetterRecallData,
  BetterRecallSettings,
  DEFAULT_SETTINGS,
} from './settings/data';
import { FILE_VIEW_TYPE } from './ui/constants';
import { RecallView } from './ui/views';
import { DecksManager } from './data/manager/decks-manager';
import { EventEmitter } from './data/event';
import { AnkiAlgorithm } from './spaced-repetition/anki';
import { SettingsTab } from './ui/settings/SettingsTab';
import {
  activateRecallLeaf,
  pruneDuplicateRecallLeaves,
} from './util/recall-leaves';
import { stripPersistedRecallLeavesInWorkspaceFile } from './util/workspace-recall-leaves';

export default class BetterRecallPlugin extends Plugin {
  public readonly algorithm = new AnkiAlgorithm();
  public readonly decksManager = new DecksManager(this, this.algorithm);

  private data: BetterRecallData;
  private eventEmitter: EventEmitter;

  async onload() {
    await stripPersistedRecallLeavesInWorkspaceFile(
      this.app.vault.adapter,
      this.app.vault.configDir,
      FILE_VIEW_TYPE,
    );

    this.eventEmitter = new EventEmitter();

    await this.loadPluginData();
    this.algorithm.setParameters(this.getSettings().intervalMultiplier);

    this.registerView(FILE_VIEW_TYPE, (leaf) => new RecallView(this, leaf));
    registerCommands(this);

    this.addRibbonIcon('wallet-cards', 'Open decks', () => {
      this.openRecallView();
    });

    this.addSettingTab(new SettingsTab(this));

    void this.whenWorkspaceReady()
      .then(() => {
        pruneDuplicateRecallLeaves(this.app.workspace);
      })
      .then(() => this.decksManager.load())
      .then(() => {
        this.getEventEmitter().emit('decksLoaded', {});
      });
  }

  onunload() {
    void stripPersistedRecallLeavesInWorkspaceFile(
      this.app.vault.adapter,
      this.app.vault.configDir,
      FILE_VIEW_TYPE,
    );
  }

  /**
   * Opens the recall view of the plugin which displays all possible decks.
   */
  public openRecallView(): void {
    activateRecallLeaf(this.app.workspace);
  }

  /**
   * Opens the recall view and navigates to the add-card editor (for the "Add card" command).
   */
  public openRecallViewAndAddCard(): void {
    const leaf = activateRecallLeaf(this.app.workspace);
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

  /**
   * Waits until Obsidian's workspace layout (and vault file indexing) is ready
   * before reading deck files from disk.
   */
  private whenWorkspaceReady(): Promise<void> {
    return new Promise((resolve) => {
      this.app.workspace.onLayoutReady(() => resolve());
    });
  }

  public getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }

  public getSettings(): BetterRecallSettings {
    return this.data.settings;
  }

  public async setIntervalMultiplier(multiplier: number): Promise<void> {
    const oldMultiplier = this.getSettings().intervalMultiplier;
    if (oldMultiplier !== multiplier) {
      await this.decksManager.rescaleAllCardsForMultiplierChange(
        oldMultiplier,
        multiplier,
      );
    }
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

  public setGeminiApiKey(apiKey: string): void {
    this.getSettings().geminiApiKey = apiKey;
  }

  public setGeminiModel(model: string): void {
    this.getSettings().geminiModel = model;
  }

  public setGroqApiKey(apiKey: string): void {
    this.getSettings().groqApiKey = apiKey;
  }

  public setOpenRouterApiKey(apiKey: string): void {
    this.getSettings().openRouterApiKey = apiKey;
  }

  public setSystemPrompt(systemPrompt: string): void {
    this.getSettings().systemPrompt = systemPrompt;
  }

  public setChatHistoryLimit(limit: number): void {
    this.getSettings().chatHistoryLimit = limit;
  }

  public getData(): BetterRecallData {
    return this.data;
  }

  public async savePluginData(): Promise<void> {
    await this.saveData(this.data);
  }
}
