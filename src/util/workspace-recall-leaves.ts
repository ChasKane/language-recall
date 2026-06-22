import type { DataAdapter } from 'obsidian';

export type WorkspaceJson = Record<string, unknown>;

export type WorkspaceTreeNode = {
  id?: string;
  type?: string;
  children?: WorkspaceTreeNode[];
  state?: {
    type?: string;
    state?: unknown;
    icon?: string;
    title?: string;
  };
};

type RecallLeafRef = {
  node: WorkspaceTreeNode;
  parent: WorkspaceTreeNode;
  index: number;
};

const WORKSPACE_REGION_KEYS = ['main', 'left', 'right'] as const;

function getWorkspaceRoots(data: WorkspaceJson): WorkspaceTreeNode[] {
  const roots: WorkspaceTreeNode[] = [];
  for (const key of WORKSPACE_REGION_KEYS) {
    const node = data[key];
    if (node && typeof node === 'object') {
      roots.push(node as WorkspaceTreeNode);
    }
  }
  return roots;
}

function walkWorkspace(
  node: WorkspaceTreeNode,
  visit: (node: WorkspaceTreeNode, parent: WorkspaceTreeNode | null) => void,
  parent: WorkspaceTreeNode | null = null,
): void {
  visit(node, parent);
  if (!Array.isArray(node.children)) {
    return;
  }
  for (const child of node.children) {
    walkWorkspace(child, visit, node);
  }
}

function collectRecallLeafRefs(
  data: WorkspaceJson,
  viewType: string,
): RecallLeafRef[] {
  const refs: RecallLeafRef[] = [];
  for (const root of getWorkspaceRoots(data)) {
    walkWorkspace(root, (node, parent) => {
      if (
        node.type !== 'leaf' ||
        node.state?.type !== viewType ||
        !parent?.children
      ) {
        return;
      }
      const index = parent.children.indexOf(node);
      if (index >= 0) {
        refs.push({ node, parent, index });
      }
    });
  }
  return refs;
}

function findFirstLeafId(data: WorkspaceJson): string | null {
  let firstId: string | null = null;
  for (const root of getWorkspaceRoots(data)) {
    walkWorkspace(root, (node) => {
      if (firstId || node.type !== 'leaf' || !node.id) {
        return;
      }
      firstId = node.id;
    });
  }
  return firstId;
}

function removeRecallLeafRefs(refs: RecallLeafRef[]): string[] {
  const removedIds: string[] = [];
  const sorted = [...refs].sort((a, b) => b.index - a.index);
  for (const { node, parent, index } of sorted) {
    if (!parent.children) {
      continue;
    }
    if (parent.children[index] !== node) {
      continue;
    }
    parent.children.splice(index, 1);
    if (node.id) {
      removedIds.push(node.id);
    }
  }
  return removedIds;
}

function fixActiveLeafId(data: WorkspaceJson, removedIds: string[]): void {
  const active = data.active;
  if (typeof active !== 'string' || !removedIds.includes(active)) {
    return;
  }
  const replacement = findFirstLeafId(data);
  if (replacement) {
    data.active = replacement;
  } else {
    delete data.active;
  }
}

/** Removes tab containers left empty after stripping recall leaves. */
function removeEmptyTabsContainers(node: WorkspaceTreeNode): void {
  if (!Array.isArray(node.children)) {
    return;
  }
  for (const child of node.children) {
    removeEmptyTabsContainers(child);
  }
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i];
    if (
      child.type === 'tabs' &&
      (!child.children || child.children.length === 0)
    ) {
      node.children.splice(i, 1);
    }
  }
}

function workspaceJsonPath(configDir: string): string {
  return `${configDir}/workspace.json`;
}

/**
 * Removes every persisted recall-view leaf from workspace.json data.
 * Obsidian will not restore those tabs on the next launch.
 */
export function stripPersistedRecallLeavesFromWorkspaceData(
  data: WorkspaceJson,
  viewType: string,
): boolean {
  const refs = collectRecallLeafRefs(data, viewType);
  if (refs.length === 0) {
    return false;
  }

  const removedIds = removeRecallLeafRefs(refs);
  fixActiveLeafId(data, removedIds);
  for (const root of getWorkspaceRoots(data)) {
    removeEmptyTabsContainers(root);
  }
  return true;
}

/**
 * Edits workspace.json via the vault adapter (works on desktop and mobile).
 */
export async function stripPersistedRecallLeavesWithAdapter(
  adapter: DataAdapter,
  configDir: string,
  viewType: string,
): Promise<boolean> {
  const filePath = workspaceJsonPath(configDir);
  if (!(await adapter.exists(filePath))) {
    return false;
  }

  let data: WorkspaceJson;
  try {
    data = JSON.parse(await adapter.read(filePath)) as WorkspaceJson;
  } catch {
    return false;
  }

  if (!stripPersistedRecallLeavesFromWorkspaceData(data, viewType)) {
    return false;
  }

  try {
    await adapter.write(filePath, `${JSON.stringify(data, null, 2)}\n`);
  } catch {
    return false;
  }

  return true;
}

/**
 * Desktop-only synchronous strip using Node fs, before workspace restore.
 * No-op on mobile where Node builtins are unavailable.
 */
export function stripPersistedRecallLeavesInWorkspaceFile(
  configDir: string,
  viewType: string,
): boolean {
  try {
    // Dynamic require: fs/path are not available in Obsidian mobile.
    /* eslint-disable import/no-nodejs-modules, no-undef, @typescript-eslint/no-require-imports */
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    /* eslint-enable import/no-nodejs-modules, no-undef, @typescript-eslint/no-require-imports */

    const filePath = path.join(configDir, 'workspace.json');
    if (!fs.existsSync(filePath)) {
      return false;
    }

    let data: WorkspaceJson;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as WorkspaceJson;
    } catch {
      return false;
    }

    if (!stripPersistedRecallLeavesFromWorkspaceData(data, viewType)) {
      return false;
    }

    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}
