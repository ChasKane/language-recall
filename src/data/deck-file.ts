import { parseYaml, stringifyYaml } from 'obsidian';
import { CardState, CardType } from 'src/spaced-repetition';
import { DeckJsonStructure, CardJsonStructure } from './deck';

export interface DeckFileMetadata {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Parses a deck markdown file into a DeckJsonStructure.
 * Format:
 * ---
 * id: deck-id
 * name: Deck Name
 * description: Description
 * createdAt: 2024-01-01
 * updatedAt: 2024-01-01
 * ---
 *
 * card-id|front|back|state|easeFactor|interval|iteration|stepIndex|lastReviewDate|nextReviewDate
 */
export function parseDeckFile(content: string): DeckJsonStructure {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    throw new Error('Invalid deck file format: missing frontmatter');
  }

  const metadata = parseYaml(match[1]) as DeckFileMetadata;
  const cardsContent = match[2].trim();

  const cards: Record<string, CardJsonStructure> = {};

  if (cardsContent) {
    const lines = cardsContent.split('\n').filter((line) => line.trim());
    for (const line of lines) {
      // Split by pipe, but respect escaped pipes.
      const parts: string[] = [];
      let current = '';
      let escaped = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (escaped) {
          current += `\\${char}`;
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '|') {
          parts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      if (escaped) {
        current += '\\';
      }
      parts.push(current.trim()); // Add the last part

      if (parts.length < 10) {
        continue; // Skip invalid lines
      }

      const [
        id,
        front,
        back,
        stateStr,
        easeFactorStr,
        intervalStr,
        iterationStr,
        stepIndexStr,
        lastReviewDateStr,
        nextReviewDateStr,
      ] = parts;

      const card: CardJsonStructure = {
        type: CardType.BASIC,
        content: {
          front: unescapePipe(front || ''),
          back: unescapePipe(back || ''),
        },
        state: parseInt(stateStr, 10) as CardState,
        easeFactor: parseFloat(easeFactorStr) || 2.5,
        interval: parseFloat(intervalStr) || 0,
        iteration: parseInt(iterationStr, 10) || 0,
        stepIndex: parseInt(stepIndexStr, 10) || 0,
        lastReviewDate:
          lastReviewDateStr && lastReviewDateStr !== 'null'
            ? new Date(lastReviewDateStr)
            : undefined,
        nextReviewDate:
          nextReviewDateStr && nextReviewDateStr !== 'null'
            ? new Date(nextReviewDateStr)
            : undefined,
      };

      cards[id] = card;
    }
  }

  return {
    id: metadata.id,
    name: metadata.name,
    description: metadata.description || '',
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    cards,
  };
}

/**
 * Converts a DeckJsonStructure to a markdown file string.
 */
export function stringifyDeckFile(deck: DeckJsonStructure): string {
  const metadata: DeckFileMetadata = {
    id: deck.id,
    name: deck.name,
    description: deck.description,
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
  };

  const frontmatter = stringifyYaml(metadata).trimEnd();
  const cards: string[] = [];

  for (const [id, card] of Object.entries(deck.cards)) {
    const line = [
      id,
      escapePipe(card.content.front),
      escapePipe(card.content.back),
      card.state.toString(),
      card.easeFactor.toString(),
      card.interval.toString(),
      card.iteration.toString(),
      card.stepIndex.toString(),
      card.lastReviewDate ? card.lastReviewDate.toISOString() : 'null',
      card.nextReviewDate ? card.nextReviewDate.toISOString() : 'null',
    ].join('|');
    cards.push(line);
  }

  return `---\n${frontmatter}\n---\n${cards.join('\n')}\n`;
}

/**
 * Escapes pipe characters in card content.
 */
function escapePipe(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '\\n');
}

/**
 * Unescapes pipe characters in card content.
 */
function unescapePipe(text: string): string {
  let unescaped = '';
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (!escaped) {
      if (char === '\\') {
        escaped = true;
      } else {
        unescaped += char;
      }
      continue;
    }

    if (char === 'n') {
      unescaped += '\n';
    } else {
      unescaped += char;
    }
    escaped = false;
  }

  if (escaped) {
    unescaped += '\\';
  }

  return unescaped;
}
