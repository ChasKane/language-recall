import { describe, expect, it, vi } from 'vitest';
import {
  detachAllRecallLeaves,
  getPreferredRecallLeaf,
  getRecallLeaves,
  pruneDuplicateRecallLeaves,
} from './recall-leaves';

function mockLeaf(id: string): { id: string; detach: ReturnType<typeof vi.fn> } {
  return { id, detach: vi.fn() };
}

function mockWorkspace(
  leaves: ReturnType<typeof mockLeaf>[],
  activeLeaf: ReturnType<typeof mockLeaf> | null = null,
) {
  return {
    activeLeaf,
    getLeavesOfType: vi.fn(() => leaves),
  };
}

describe('recall-leaves', () => {
  it('getRecallLeaves delegates to workspace.getLeavesOfType', () => {
    const leaf = mockLeaf('a');
    const workspace = mockWorkspace([leaf]);
    expect(getRecallLeaves(workspace as never)).toEqual([leaf]);
    expect(workspace.getLeavesOfType).toHaveBeenCalledWith('recall-view');
  });

  it('getPreferredRecallLeaf prefers the active recall leaf', () => {
    const first = mockLeaf('first');
    const active = mockLeaf('active');
    const workspace = mockWorkspace([first, active], active);
    expect(getPreferredRecallLeaf(workspace as never)).toBe(active);
  });

  it('getPreferredRecallLeaf falls back to the first leaf', () => {
    const first = mockLeaf('first');
    const second = mockLeaf('second');
    const workspace = mockWorkspace([first, second], null);
    expect(getPreferredRecallLeaf(workspace as never)).toBe(first);
  });

  it('pruneDuplicateRecallLeaves keeps one leaf and detaches the rest', () => {
    const keep = mockLeaf('keep');
    const extraA = mockLeaf('extra-a');
    const extraB = mockLeaf('extra-b');
    const workspace = mockWorkspace([keep, extraA, extraB], keep);

    pruneDuplicateRecallLeaves(workspace as never);

    expect(keep.detach).not.toHaveBeenCalled();
    expect(extraA.detach).toHaveBeenCalledOnce();
    expect(extraB.detach).toHaveBeenCalledOnce();
  });

  it('pruneDuplicateRecallLeaves is a no-op with zero or one leaf', () => {
    const only = mockLeaf('only');
    const workspace = mockWorkspace([only], only);
    pruneDuplicateRecallLeaves(workspace as never);
    expect(only.detach).not.toHaveBeenCalled();
  });

  it('detachAllRecallLeaves closes every recall leaf', () => {
    const detachLeavesOfType = vi.fn();
    detachAllRecallLeaves({ detachLeavesOfType } as never);
    expect(detachLeavesOfType).toHaveBeenCalledWith('recall-view');
  });
});
