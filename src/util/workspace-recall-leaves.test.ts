import { describe, expect, it } from 'vitest';
import { stripPersistedRecallLeavesFromWorkspaceData } from './workspace-recall-leaves';

const VIEW_TYPE = 'recall-view';

function recallLeaf(id: string): Record<string, unknown> {
  return {
    id,
    type: 'leaf',
    state: { type: VIEW_TYPE, state: {} },
  };
}

function markdownLeaf(id: string, file: string): Record<string, unknown> {
  return {
    id,
    type: 'leaf',
    state: {
      type: 'markdown',
      state: { file, mode: 'source', source: false },
    },
  };
}

describe('workspace-recall-leaves', () => {
  it('removes all recall-view leaves and fixes active', () => {
    const data = {
      main: {
        type: 'tabs',
        children: [
          recallLeaf('recall-a'),
          recallLeaf('recall-b'),
          markdownLeaf('md-1', 'note.md'),
        ],
      },
      active: 'recall-b',
    };

    expect(
      stripPersistedRecallLeavesFromWorkspaceData(data, VIEW_TYPE),
    ).toBe(true);

    const main = data.main as { children: { state: { type: string } }[] };
    expect(main.children).toHaveLength(1);
    expect(main.children[0].state.type).toBe('markdown');
    expect(data.active).toBe('md-1');
  });

  it('removes empty tab containers left after stripping recall leaves', () => {
    const data = {
      main: {
        type: 'split',
        children: [
          {
            type: 'tabs',
            children: [recallLeaf('recall-only')],
          },
        ],
      },
      active: 'recall-only',
    };

    expect(
      stripPersistedRecallLeavesFromWorkspaceData(data, VIEW_TYPE),
    ).toBe(true);

    const main = data.main as { children: unknown[] };
    expect(main.children).toHaveLength(0);
    expect(data.active).toBeUndefined();
  });

  it('is a no-op when there are no recall leaves', () => {
    const data = {
      main: {
        type: 'tabs',
        children: [markdownLeaf('md-1', 'note.md')],
      },
      active: 'md-1',
    };

    expect(
      stripPersistedRecallLeavesFromWorkspaceData(data, VIEW_TYPE),
    ).toBe(false);
  });
});
