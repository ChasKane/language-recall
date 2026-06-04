import { Workspace, WorkspaceLeaf } from 'obsidian';
import { FILE_VIEW_TYPE } from '../ui/constants';

export function getRecallLeaves(workspace: Workspace): WorkspaceLeaf[] {
  return workspace.getLeavesOfType(FILE_VIEW_TYPE);
}

/**
 * Returns the recall leaf to reuse: active recall leaf if any, otherwise the first.
 */
export function getPreferredRecallLeaf(
  workspace: Workspace,
): WorkspaceLeaf | null {
  const leaves = getRecallLeaves(workspace);
  if (leaves.length === 0) {
    return null;
  }

  const activeLeaf = workspace.activeLeaf;
  if (activeLeaf && leaves.includes(activeLeaf)) {
    return activeLeaf;
  }

  return leaves[0];
}

/**
 * Closes extra recall leaves left over from older versions that opened a new leaf
 * per card-editor navigation on Android.
 */
export function pruneDuplicateRecallLeaves(workspace: Workspace): void {
  const leaves = getRecallLeaves(workspace);
  if (leaves.length <= 1) {
    return;
  }

  const keep = getPreferredRecallLeaf(workspace) ?? leaves[0];
  for (const leaf of leaves) {
    if (leaf !== keep) {
      leaf.detach();
    }
  }
}

/**
 * Focuses an existing recall leaf or opens recall in the current pane.
 * Never splits the workspace to avoid accumulating hidden tabs.
 */
export function activateRecallLeaf(
  workspace: Workspace,
  focus = true,
): WorkspaceLeaf {
  const existing = getPreferredRecallLeaf(workspace);
  if (existing) {
    workspace.setActiveLeaf(existing, { focus });
    return existing;
  }

  const leaf = workspace.getLeaf(false);
  void leaf.setViewState({
    type: FILE_VIEW_TYPE,
    state: {},
  });
  workspace.setActiveLeaf(leaf, { focus });
  return leaf;
}
