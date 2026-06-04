export interface BetterRecallData {
  settings: BetterRecallSettings;
}

export interface BetterRecallSettings {
  decksFolderName: string;
  sourceLanguage: string;
  targetLanguage: string;
  lastSelectedDeckId: string;
  intervalMultiplier: number; // Multiplier for review intervals (0.25 to 4.0, default 1.0)
  geminiApiKey: string;
  geminiModel: string;
  groqApiKey: string;
  openRouterApiKey: string;
  systemPrompt: string;
  /** 0 = only current message, -1 = whole conversation, N = last N prior messages */
  chatHistoryLimit: number;
}

export const DEFAULT_SETTINGS: BetterRecallSettings = {
  decksFolderName: 'Language Recall',
  sourceLanguage: 'en',
  targetLanguage: 'es',
  lastSelectedDeckId: '',
  intervalMultiplier: 1.0,
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  groqApiKey: '',
  openRouterApiKey: '',
  systemPrompt: '',
  chatHistoryLimit: 2,
};
