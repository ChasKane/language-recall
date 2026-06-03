import { describe, expect, it, vi } from 'vitest';

vi.mock('./gemini', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./gemini')>();
  return {
    ...actual,
    sendGeminiFollowup: vi.fn(),
  };
});
vi.mock('./followup-groq', () => ({
  sendGroqFollowup: vi.fn(),
}));
vi.mock('./followup-openrouter', () => ({
  sendOpenRouterFollowup: vi.fn(),
}));

import { sendGeminiFollowup } from './gemini';
import { sendGroqFollowup } from './followup-groq';
import { sendOpenRouterFollowup } from './followup-openrouter';
import { sendFollowupWithFallback } from './followup-send';

const baseOptions = {
  geminiApiKey: 'gemini-key',
  cardFront: 'hola',
  cardBack: 'hello',
  messages: [],
  userMessage: 'Explain this.',
};

describe('sendFollowupWithFallback', () => {
  it('returns Gemini result when primary succeeds', async () => {
    vi.mocked(sendGeminiFollowup).mockResolvedValue({
      displayText: 'Gemini answer',
    });

    const result = await sendFollowupWithFallback(baseOptions);

    expect(result.displayText).toBe('Gemini answer');
    expect(sendGroqFollowup).not.toHaveBeenCalled();
    expect(sendOpenRouterFollowup).not.toHaveBeenCalled();
  });

  it('falls back to Groq when Gemini fails', async () => {
    vi.mocked(sendGeminiFollowup).mockRejectedValue(new Error('rate limited'));
    vi.mocked(sendGroqFollowup).mockResolvedValue({
      displayText: 'Groq answer',
    });

    const result = await sendFollowupWithFallback({
      ...baseOptions,
      groqApiKey: 'groq-key',
    });

    expect(result.displayText).toBe('Groq answer');
    expect(sendGroqFollowup).toHaveBeenCalledOnce();
    expect(sendOpenRouterFollowup).not.toHaveBeenCalled();
  });

  it('prompts for Groq key only after Gemini fails', async () => {
    vi.mocked(sendGeminiFollowup).mockRejectedValue(new Error('quota exceeded'));
    vi.mocked(sendGroqFollowup).mockResolvedValue({
      displayText: 'Groq answer',
    });

    const promptFallbackKey = vi.fn().mockResolvedValue('prompted-groq-key');

    const result = await sendFollowupWithFallback({
      ...baseOptions,
      promptFallbackKey,
    });

    expect(promptFallbackKey).toHaveBeenCalledWith('groq');
    expect(promptFallbackKey).not.toHaveBeenCalledWith('openrouter');
    expect(result.displayText).toBe('Groq answer');
    expect(sendGroqFollowup).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'prompted-groq-key' }),
    );
  });

  it('falls back to OpenRouter after Gemini and Groq fail', async () => {
    vi.mocked(sendGeminiFollowup).mockRejectedValue(new Error('gemini down'));
    vi.mocked(sendGroqFollowup).mockRejectedValue(new Error('groq down'));
    vi.mocked(sendOpenRouterFollowup).mockResolvedValue({
      displayText: 'OpenRouter answer',
    });

    const result = await sendFollowupWithFallback({
      ...baseOptions,
      groqApiKey: 'groq-key',
      openRouterApiKey: 'or-key',
    });

    expect(result.displayText).toBe('OpenRouter answer');
    expect(sendOpenRouterFollowup).toHaveBeenCalledOnce();
  });

  it('prompts for OpenRouter key only after both Gemini and Groq fail', async () => {
    vi.mocked(sendGeminiFollowup).mockRejectedValue(new Error('gemini down'));
    vi.mocked(sendGroqFollowup).mockRejectedValue(new Error('groq down'));
    vi.mocked(sendOpenRouterFollowup).mockResolvedValue({
      displayText: 'OpenRouter answer',
    });

    const promptFallbackKey = vi
      .fn()
      .mockResolvedValueOnce('prompted-groq-key')
      .mockResolvedValueOnce('prompted-or-key');

    const result = await sendFollowupWithFallback({
      ...baseOptions,
      promptFallbackKey,
    });

    expect(promptFallbackKey).toHaveBeenNthCalledWith(1, 'groq');
    expect(promptFallbackKey).toHaveBeenNthCalledWith(2, 'openrouter');
    expect(result.displayText).toBe('OpenRouter answer');
    expect(sendOpenRouterFollowup).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'prompted-or-key' }),
    );
  });
});
