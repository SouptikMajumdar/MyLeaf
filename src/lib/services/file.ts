import { db } from "@/lib/db";
import { FileNode } from "@/types/files";
import { checkProjectAccess } from "./project";

// Default content for new main.tex file
const DEFAULT_TEX_CONTENT = `\\documentclass{article}
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

\\end{document}`;

// Convert database files to FileNode tree
export function buildFileTree(
  dbFiles: Array<{
    id: string;
    name: string;
    type: string;
    content: string | null;
    parentId: string | null;
    projectId: string;
  }>,
  projectId: string,
  projectName: string
): FileNode {
  // Create root folder
  const root: FileNode = {
    id: `root-${projectId}`,
    name: projectName,
    type: "folder",
    parentId: null,
    children: [],
  };

  // Create a map for quick lookup
  const nodeMap = new Map<string, FileNode>();
  nodeMap.set(root.id, root);

  // First pass: create all nodes
  for (const file of dbFiles) {
    const node: FileNode = {
      id: file.id,
      name: file.name,
      type: file.type as "file" | "folder",
      parentId: file.parentId || root.id,
      content: file.type === "file" ? (file.content ?? "") : undefined,
      children: file.type === "folder" ? [] : undefined,
    };
    nodeMap.set(file.id, node);
  }

  // Second pass: build tree structure
  for (const file of dbFiles) {
    const node = nodeMap.get(file.id)!;
    const parentId = file.parentId || root.id;
    const parent = nodeMap.get(parentId);

    if (parent && parent.children) {
      parent.children.push(node);
    }
  }

  // Sort children: folders first, then alphabetically
  const sortChildren = (node: FileNode) => {
    if (node.children) {
      node.children.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "folder" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortChildren);
    }
  };
  sortChildren(root);

  return root;
}

// Get file tree for a project
export async function getFileTree(
  projectId: string,
  userId: string
): Promise<FileNode | null> {
  const access = await checkProjectAccess(projectId, userId);
  if (!access) return null;

  const project = await db.project.findUnique({
    where: { id: projectId },
  });

  if (!project) return null;

  const files = await db.file.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });

  return buildFileTree(files, projectId, project.name);
}

// Create a file or folder
export async function createFile(
  projectId: string,
  userId: string,
  name: string,
  type: "file" | "folder",
  parentId?: string,
  content?: string
) {
  const access = await checkProjectAccess(projectId, userId);
  if (!access || access === "viewer") return null;

  // Validate parent exists if provided
  if (parentId) {
    const parent = await db.file.findFirst({
      where: { id: parentId, projectId, type: "folder" },
    });
    if (!parent) return null;
  }

  const file = await db.file.create({
    data: {
      name,
      type,
      content: type === "file" ? (content ?? "") : null,
      parentId: parentId || null,
      projectId,
    },
  });

  // Update project's updatedAt
  await db.project.update({
    where: { id: projectId },
    data: { updatedAt: new Date() },
  });

  return {
    id: file.id,
    name: file.name,
    type: file.type as "file" | "folder",
    parentId: file.parentId,
    content: file.content,
  };
}

// Get a single file
export async function getFile(
  fileId: string,
  userId: string
) {
  const file = await db.file.findUnique({
    where: { id: fileId },
    include: { project: true },
  });

  if (!file) return null;

  const access = await checkProjectAccess(file.projectId, userId);
  if (!access) return null;

  return {
    id: file.id,
    name: file.name,
    type: file.type as "file" | "folder",
    content: file.content,
    parentId: file.parentId,
    projectId: file.projectId,
  };
}

// Update file (content or rename)
export async function updateFile(
  fileId: string,
  userId: string,
  data: { name?: string; content?: string }
) {
  const file = await db.file.findUnique({
    where: { id: fileId },
  });

  if (!file) return null;

  const access = await checkProjectAccess(file.projectId, userId);
  if (!access || access === "viewer") return null;

  const updated = await db.file.update({
    where: { id: fileId },
    data: {
      name: data.name,
      content: data.content,
      updatedAt: new Date(),
    },
  });

  // Update project's updatedAt
  await db.project.update({
    where: { id: file.projectId },
    data: { updatedAt: new Date() },
  });

  return {
    id: updated.id,
    name: updated.name,
    type: updated.type as "file" | "folder",
    content: updated.content,
    parentId: updated.parentId,
  };
}

// Delete file (and cascade children for folders)
export async function deleteFile(fileId: string, userId: string) {
  const file = await db.file.findUnique({
    where: { id: fileId },
  });

  if (!file) return false;

  const access = await checkProjectAccess(file.projectId, userId);
  if (!access || access === "viewer") return false;

  // Delete file (cascade will handle children due to schema)
  await db.file.delete({
    where: { id: fileId },
  });

  // Update project's updatedAt
  await db.project.update({
    where: { id: file.projectId },
    data: { updatedAt: new Date() },
  });

  return true;
}

// Move file to new parent
export async function moveFile(
  fileId: string,
  userId: string,
  newParentId: string | null
) {
  const file = await db.file.findUnique({
    where: { id: fileId },
  });

  if (!file) return false;

  const access = await checkProjectAccess(file.projectId, userId);
  if (!access || access === "viewer") return false;

  // Validate new parent
  if (newParentId) {
    const parent = await db.file.findFirst({
      where: { id: newParentId, projectId: file.projectId, type: "folder" },
    });
    if (!parent) return false;

    // Prevent moving folder into itself or its children
    if (file.type === "folder") {
      let current = parent;
      while (current) {
        if (current.id === fileId) return false;
        if (!current.parentId) break;
        const next = await db.file.findUnique({
          where: { id: current.parentId },
        });
        if (!next) break;
        current = next;
      }
    }
  }

  await db.file.update({
    where: { id: fileId },
    data: { parentId: newParentId },
  });

  return true;
}

// Initialize a project with default files
export async function initializeProjectFiles(projectId: string) {
  // Check if project already has files
  const existingFiles = await db.file.count({
    where: { projectId },
  });

  if (existingFiles > 0) return;

  // Create default main.tex
  await db.file.create({
    data: {
      name: "main.tex",
      type: "file",
      content: DEFAULT_TEX_CONTENT,
      parentId: null,
      projectId,
    },
  });
}

// Get all files as flat list (for compilation)
export async function getProjectFiles(
  projectId: string,
  userId: string
): Promise<{ filename: string; content: string }[] | null> {
  const access = await checkProjectAccess(projectId, userId);
  if (!access) return null;

  const files = await db.file.findMany({
    where: { projectId, type: "file" },
  });

  return files.map((f) => ({
    filename: f.name,
    content: f.content ?? "",
  }));
}
