import { Deck, DeckJsonStructure, jsonObjectToDeck } from '../deck';
import {
  SpacedRepetitionAlgorithm,
  SpacedRepetitionItem,
} from 'src/spaced-repetition';
import BetterRecallPlugin from 'src/main';
import { parseDeckFile, stringifyDeckFile } from '../deck-file';

export class DecksManager {
  private static readonly INVALID_FILENAME_CHARS = new Set([
    '<',
    '>',
    ':',
    '"',
    '/',
    '\\',
    '|',
    '?',
    '*',
  ]);

  private decks: Record<string, Deck>;
  private algorithm: SpacedRepetitionAlgorithm<unknown>;
  private deckFilePaths: Record<string, string> = {}; // deckId -> file path
  private loadPromise: Promise<void> | null = null;
  private loaded = false;

  constructor(
    private plugin: BetterRecallPlugin,
    algorithm: SpacedRepetitionAlgorithm<unknown>,
  ) {
    this.decks = {};
    this.algorithm = algorithm;
  }

  private getDecksFolder(): string {
    return this.plugin.getSettings().decksFolderName || 'Language Recall';
  }

  public isLoaded(): boolean {
    return this.loaded;
  }

  public whenLoaded(): Promise<void> {
    return this.loadPromise ?? Promise.resolve();
  }

  public load(): Promise<void> {
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this.loadFromDisk().finally(() => {
      this.loaded = true;
    });
    return this.loadPromise;
  }

  private async loadFromDisk(): Promise<void> {
    // Load all deck files from the decks folder
    const decksFolder = this.getDecksFolder();

    try {
      // Ensure the folder exists
      if (!(await this.plugin.app.vault.adapter.exists(decksFolder))) {
        await this.plugin.app.vault.adapter.mkdir(decksFolder);
        return;
      }

      // List all markdown files in the decks folder
      const files = await this.plugin.app.vault.adapter.list(decksFolder);
      const deckFiles = files.files.filter((f) => f.endsWith('.md'));

      // Load each deck file
      for (const filePath of deckFiles) {
        try {
          await this.loadDeckFromFile(filePath);
        } catch (error) {
          console.error(`Failed to load deck from ${filePath}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to load decks:', error);
    }
  }

  private async loadDeckFromFile(filePath: string): Promise<void> {
    const content = await this.plugin.app.vault.adapter.read(filePath);
    const deckJson = parseDeckFile(content);
    this.decks[deckJson.id] = jsonObjectToDeck(this.algorithm, deckJson);
    this.deckFilePaths[deckJson.id] = filePath;
  }

  public async create(deckName: string, description: string): Promise<Deck> {
    console.debug(`Creating deck: ${deckName}`);
    deckName = deckName.trim();
    if (!this.isValidFileName(deckName)) {
      throw new Error(`Invalid deck name: ${deckName}`);
    }

    if (this.decksArray.find((deck) => deck.getName() === deckName)) {
      throw new Error(`Deck name already exists: ${deckName}`);
    }

    const deckData = new Deck(this.algorithm, deckName, description);
    this.decks[deckData.id] = deckData;
    console.debug(`Deck created with ID: ${deckData.id}`);

    // Create the deck file
    await this.saveDeckToFile(deckData.id);
    return deckData;
  }

  public async updateInformation(
    id: string,
    newName: string,
    newDescription: string,
  ): Promise<Deck> {
    newName = newName.trim();
    if (!this.isValidFileName(newName)) {
      throw new Error(`Invalid deck name: ${newName}`);
    }

    if (!(id in this.decks)) {
      throw new Error(`Deck with id does not exist: ${id}`);
    }

    this.decks[id].setName(newName);
    this.decks[id].setDescription(newDescription);
    await this.saveDeckToFile(id);
    return this.decks[id];
  }

  public async addCard(
    deckId: string,
    card: SpacedRepetitionItem,
  ): Promise<void> {
    if (!(deckId in this.decks)) {
      throw new Error(`No deck with id found: ${deckId}`);
    }
    this.decks[deckId].cards[card.id] = card;
    await this.saveDeckToFile(deckId);
  }

  public async updateCardContent(
    deckId: string,
    updatedCard: SpacedRepetitionItem,
  ): Promise<void> {
    if (!(deckId in this.decks)) {
      throw new Error(`No deck with id found: ${deckId}`);
    }

    if (!(updatedCard.id in this.decks[deckId].cards)) {
      throw new Error(`No card in deck with card id found: ${updatedCard.id}`);
    }

    this.decks[deckId].cards[updatedCard.id] = updatedCard;
    await this.saveDeckToFile(deckId);
  }

  public async removeCard(deckId: string, cardId: string): Promise<void> {
    if (!(deckId in this.decks)) {
      throw new Error(`No deck with id found: ${deckId}`);
    }

    if (!(cardId in this.decks[deckId].cards)) {
      throw new Error(`No card in deck with card id found: ${cardId}`);
    }

    delete this.decks[deckId].cards[cardId];
    await this.saveDeckToFile(deckId);
  }

  public async save(): Promise<void> {
    // Save all decks to their respective files
    for (const deckId of Object.keys(this.decks)) {
      await this.saveDeckToFile(deckId);
    }
  }

  public async saveDeckToFile(deckId: string): Promise<void> {
    if (!(deckId in this.decks)) {
      console.error(`Deck ${deckId} not found in decks`);
      return;
    }

    try {
      const deck = this.decks[deckId];
      const deckJson = deck.toJsonObject();

      // Update the updatedAt timestamp (use ISO string for consistency)
      deckJson.updatedAt = new Date().toISOString();

      const content = stringifyDeckFile(deckJson);
      const filePath = this.getDeckFilePath(deckId, deck.getName());

      console.debug(`Saving deck to file: ${filePath}`);

      // Ensure the decks folder exists
      const decksFolder = this.getDecksFolder();
      console.debug(`Checking decks folder: ${decksFolder}`);

      if (!(await this.plugin.app.vault.adapter.exists(decksFolder))) {
        console.debug(`Creating decks folder: ${decksFolder}`);
        await this.plugin.app.vault.adapter.mkdir(decksFolder);
      }

      console.debug(`Writing deck file: ${filePath}`);
      await this.plugin.app.vault.adapter.write(filePath, content);
      this.deckFilePaths[deckId] = filePath;
      console.debug(`Successfully saved deck to ${filePath}`);
    } catch (error) {
      console.error(`Failed to save deck ${deckId} to file:`, error);
      throw error;
    }
  }

  private getDeckFilePath(deckId: string, deckName: string): string {
    // Use first 4 characters of deck ID as filename prefix to avoid conflicts with renamed decks
    const shortId = deckId.substring(0, 4);
    const sanitizedName = this.sanitizeFileName(deckName);
    const decksFolder = this.getDecksFolder();
    return `${decksFolder}/${shortId}-${sanitizedName}.md`;
  }

  /**
   * Renames the decks folder. Moves all deck files from old folder to new folder.
   */
  public async renameDecksFolder(newFolderName: string): Promise<void> {
    const oldFolder = this.getDecksFolder();
    const newFolder = newFolderName.trim();

    if (!newFolder) {
      throw new Error('Folder name cannot be empty');
    }

    if (oldFolder === newFolder) {
      return; // No change needed
    }

    // Check if old folder exists
    if (!(await this.plugin.app.vault.adapter.exists(oldFolder))) {
      // Old folder doesn't exist, just create the new one
      await this.plugin.app.vault.adapter.mkdir(newFolder);
      return;
    }

    // Get all files in the old folder
    const files = await this.plugin.app.vault.adapter.list(oldFolder);
    const deckFiles = files.files.filter((f) => f.endsWith('.md'));

    // Create new folder
    await this.plugin.app.vault.adapter.mkdir(newFolder);

    // Move all deck files to new folder
    for (const oldFilePath of deckFiles) {
      const fileName = oldFilePath.split('/').pop() || '';
      const newFilePath = `${newFolder}/${fileName}`;

      // Read old file
      const content = await this.plugin.app.vault.adapter.read(oldFilePath);
      // Write to new location
      await this.plugin.app.vault.adapter.write(newFilePath, content);
      // Delete old file
      await this.plugin.app.vault.adapter.remove(oldFilePath);

      // Update file path in deckFilePaths
      for (const [deckId, path] of Object.entries(this.deckFilePaths)) {
        if (path === oldFilePath) {
          this.deckFilePaths[deckId] = newFilePath;
        }
      }
    }

    // Remove old folder if it's empty
    try {
      const remainingFiles =
        await this.plugin.app.vault.adapter.list(oldFolder);
      if (
        remainingFiles.files.length === 0 &&
        remainingFiles.folders.length === 0
      ) {
        // Try to remove the folder - Obsidian's adapter may support this
        // If it doesn't work, the folder will remain empty but that's okay
        try {
          await this.plugin.app.vault.adapter.rmdir(oldFolder, false);
        } catch {
          // rmdir might not be available or might fail, that's okay
          console.debug(
            `Could not remove old folder ${oldFolder}, it will remain empty`,
          );
        }
      }
    } catch {
      // If we can't list the folder, we can't remove it safely
      console.debug(`Could not check old folder ${oldFolder} for removal`);
    }
  }

  public async delete(id: string): Promise<void> {
    if (!(id in this.decks)) {
      throw new Error(`Deck name does not exist: ${id}`);
    }

    // Delete the deck file
    const filePath = this.deckFilePaths[id];
    if (filePath && (await this.plugin.app.vault.adapter.exists(filePath))) {
      await this.plugin.app.vault.adapter.remove(filePath);
    }

    delete this.decks[id];
    delete this.deckFilePaths[id];
  }

  /**
   * Reloads a deck from its file. Useful when a deck is selected for use.
   */
  public async reloadDeck(deckId: string): Promise<void> {
    if (!(deckId in this.decks)) {
      throw new Error(`Deck with id does not exist: ${deckId}`);
    }

    const filePath = this.deckFilePaths[deckId];
    if (!filePath) {
      throw new Error(`No file path found for deck: ${deckId}`);
    }

    await this.loadDeckFromFile(filePath);
  }

  public get decksArray(): Deck[] {
    // Drops the keys because we don't necessarily need them.
    return Object.values(this.decks);
  }

  public getDecks(): Record<string, Deck> {
    return this.decks;
  }

  /**
   * Rescales every card's interval and due date when the review interval
   * multiplier changes, keeping already-due cards due.
   */
  public async rescaleAllCardsForMultiplierChange(
    oldMultiplier: number,
    newMultiplier: number,
  ): Promise<void> {
    if (
      oldMultiplier <= 0 ||
      newMultiplier <= 0 ||
      oldMultiplier === newMultiplier
    ) {
      return;
    }

    const ratio = newMultiplier / oldMultiplier;
    const now = new Date();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    for (const deck of this.decksArray) {
      let deckChanged = false;

      for (const card of deck.cardsArray) {
        if (card.interval > 0) {
          card.interval = card.interval * ratio;
          deckChanged = true;
        }

        if (!card.nextReviewDate || card.nextReviewDate <= now) {
          continue;
        }

        if (card.lastReviewDate) {
          card.nextReviewDate = new Date(
            card.lastReviewDate.getTime() + card.interval * MS_PER_DAY,
          );
        } else {
          const remainingMs = card.nextReviewDate.getTime() - now.getTime();
          card.nextReviewDate = new Date(now.getTime() + remainingMs * ratio);
        }

        deckChanged = true;
        this.algorithm.replaceItem(card);
      }

      if (deckChanged) {
        await this.saveDeckToFile(deck.id);
      }
    }
  }

  private toJsonStructure(): DeckJsonStructure[] {
    const decks = this.decksArray.map((deck) => deck.toJsonObject());
    return decks;
  }

  private isValidFileName(fileName: string): boolean {
    if (!fileName) {
      return false;
    }

    const maxLength = 255;
    if (fileName.length > maxLength) {
      return false;
    }

    for (let i = 0; i < fileName.length; i++) {
      if (this.isInvalidFileNameChar(fileName[i])) {
        return false;
      }
    }

    if (fileName.endsWith('.')) {
      return false;
    }

    return true;
  }

  private sanitizeFileName(fileName: string): string {
    let sanitized = '';
    for (let i = 0; i < fileName.length; i++) {
      const ch = fileName[i];
      sanitized += this.isInvalidFileNameChar(ch) ? '_' : ch;
    }
    return sanitized;
  }

  private isInvalidFileNameChar(ch: string): boolean {
    const code = ch.charCodeAt(0);
    // Disallow ASCII control chars (U+0000 - U+001F) and reserved filename chars.
    return code < 32 || DecksManager.INVALID_FILENAME_CHARS.has(ch);
  }
}
