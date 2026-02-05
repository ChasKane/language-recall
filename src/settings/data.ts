export interface BetterRecallData {
  settings: BetterRecallSettings;
}

export interface BetterRecallSettings {
  decksFolderName: string;
  sourceLanguage: string;
  targetLanguage: string;
  lastSelectedDeckId: string;
  intervalMultiplier: number; // Multiplier for review intervals (0.25 to 4.0, default 1.0)
}

export const DEFAULT_SETTINGS: BetterRecallSettings = {
  decksFolderName: 'Language Recall',
  sourceLanguage: 'en',
  targetLanguage: 'es',
  lastSelectedDeckId: '',
  intervalMultiplier: 1.0,
};
