export interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  content?: string;
  parentId: string | null;
}

export interface ProjectFiles {
  root: FileNode;
  activeFileId: string | null;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function createFile(
  name: string,
  parentId: string | null,
  content = "",
): FileNode {
  return {
    id: generateId(),
    name,
    type: "file",
    content,
    parentId,
  };
}

export function createFolder(name: string, parentId: string | null): FileNode {
  return {
    id: generateId(),
    name,
    type: "folder",
    children: [],
    parentId,
  };
}

export function findNode(root: FileNode, id: string): FileNode | null {
  if (root.id === id) return root;
  if (root.children) {
    for (const child of root.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return null;
}

export function findParent(root: FileNode, id: string): FileNode | null {
  if (root.children) {
    for (const child of root.children) {
      if (child.id === id) return root;
      const found = findParent(child, id);
      if (found) return found;
    }
  }
  return null;
}

export function addNode(root: FileNode, parentId: string, node: FileNode): boolean {
  const parent = findNode(root, parentId);
  if (parent && parent.type === "folder") {
    parent.children = parent.children || [];
    parent.children.push(node);
    return true;
  }
  return false;
}

export function removeNode(root: FileNode, id: string): boolean {
  const parent = findParent(root, id);
  if (parent && parent.children) {
    const index = parent.children.findIndex((c) => c.id === id);
    if (index !== -1) {
      parent.children.splice(index, 1);
      return true;
    }
  }
  return false;
}

export function renameNode(root: FileNode, id: string, newName: string): boolean {
  const node = findNode(root, id);
  if (node) {
    node.name = newName;
    return true;
  }
  return false;
}

export function updateFileContent(
  root: FileNode,
  id: string,
  content: string,
): boolean {
  const node = findNode(root, id);
  if (node && node.type === "file") {
    node.content = content;
    return true;
  }
  return false;
}

export function getFileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

export function isTexFile(name: string): boolean {
  return getFileExtension(name) === "tex";
}

export function isBibFile(name: string): boolean {
  return getFileExtension(name) === "bib";
}

export function isImageFile(name: string): boolean {
  const ext = getFileExtension(name);
  return ["png", "jpg", "jpeg", "gif", "svg", "pdf", "eps"].includes(ext);
}

// Default project structure
export function createDefaultProject(): FileNode {
  const rootId = generateId();
  return {
    id: rootId,
    name: "Project",
    type: "folder",
    parentId: null,
    children: [
      {
        id: generateId(),
        name: "main.tex",
        type: "file",
        parentId: rootId,
        content: `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{graphicx}

\\title{My Document}
\\author{Author Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}
Start writing your paper here...

\\end{document}`,
      },
    ],
  };
}

// Sort nodes: folders first, then files, alphabetically within each group
export function sortNodes(nodes: FileNode[]): FileNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "folder" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}
