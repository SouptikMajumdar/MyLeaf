"use client";

import {
  ChevronDown,
  ChevronRight,
  File,
  FileText,
  Folder,
  FolderOpen,
  Image,
  MoreHorizontal,
  Plus,
  Trash2,
  Pencil,
  FolderPlus,
  FilePlus,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  FileNode,
  sortNodes,
  getFileExtension,
  isTexFile,
  isBibFile,
  isImageFile,
  createFile,
  createFolder,
} from "@/types/files";

interface FileExplorerProps {
  root: FileNode;
  activeFileId: string | null;
  onFileSelect: (file: FileNode) => void;
  onCreateFile: (parentId: string, file: FileNode) => void;
  onCreateFolder: (parentId: string, folder: FileNode) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  activeFileId: string | null;
  expandedFolders: Set<string>;
  onToggleFolder: (id: string) => void;
  onFileSelect: (file: FileNode) => void;
  onCreateFile: (parentId: string, file: FileNode) => void;
  onCreateFolder: (parentId: string, folder: FileNode) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
}

function getFileIcon(name: string) {
  if (isTexFile(name)) {
    return <FileText className="h-4 w-4 text-green-500" />;
  }
  if (isBibFile(name)) {
    return <FileText className="h-4 w-4 text-yellow-500" />;
  }
  if (isImageFile(name)) {
    return <Image className="h-4 w-4 text-purple-500" />;
  }
  const ext = getFileExtension(name);
  if (["cls", "sty", "bst"].includes(ext)) {
    return <FileText className="h-4 w-4 text-blue-500" />;
  }
  return <File className="h-4 w-4 text-gray-500" />;
}

function TreeNode({
  node,
  depth,
  activeFileId,
  expandedFolders,
  onToggleFolder,
  onFileSelect,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
}: TreeNodeProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isExpanded = expandedFolders.has(node.id);
  const isActive = activeFileId === node.id;
  const isFolder = node.type === "folder";
  const isRoot = node.parentId === null;

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleClick = () => {
    if (isFolder) {
      onToggleFolder(node.id);
    } else {
      onFileSelect(node);
    }
  };

  const handleRename = () => {
    if (editName.trim() && editName !== node.name) {
      onRename(node.id, editName.trim());
    }
    setIsEditing(false);
    setShowMenu(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRename();
    } else if (e.key === "Escape") {
      setEditName(node.name);
      setIsEditing(false);
    }
  };

  const handleNewFile = () => {
    const name = prompt("Enter file name:", "newfile.tex");
    if (name) {
      const newFile = createFile(name, node.id);
      onCreateFile(node.id, newFile);
      if (!isExpanded) {
        onToggleFolder(node.id);
      }
    }
    setShowMenu(false);
  };

  const handleNewFolder = () => {
    const name = prompt("Enter folder name:", "newfolder");
    if (name) {
      const newFolder = createFolder(name, node.id);
      onCreateFolder(node.id, newFolder);
      if (!isExpanded) {
        onToggleFolder(node.id);
      }
    }
    setShowMenu(false);
  };

  const handleDelete = () => {
    if (
      confirm(
        `Are you sure you want to delete "${node.name}"${isFolder ? " and all its contents" : ""}?`,
      )
    ) {
      onDelete(node.id);
    }
    setShowMenu(false);
  };

  return (
    <div>
      <div
        className={`group flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-[var(--background)]/80 rounded text-sm ${
          isActive ? "bg-blue-500/20 text-blue-400" : ""
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
      >
        {isFolder ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-yellow-500" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-yellow-500" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            {getFileIcon(node.name)}
          </>
        )}

        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-[var(--background)] border border-blue-500 rounded px-1 text-sm outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 truncate">{node.name}</span>
        )}

        {!isEditing && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--foreground)]/10 rounded transition-opacity"
            >
              <MoreHorizontal className="h-3 w-3" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-6 z-50 bg-[#1e1e1e] border border-[var(--foreground)]/20 rounded shadow-lg py-1 min-w-[140px]">
                {isFolder && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNewFile();
                      }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-[var(--foreground)]/10 text-left"
                    >
                      <FilePlus className="h-4 w-4" />
                      New File
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNewFolder();
                      }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-[var(--foreground)]/10 text-left"
                    >
                      <FolderPlus className="h-4 w-4" />
                      New Folder
                    </button>
                    <hr className="my-1 border-[var(--foreground)]/20" />
                  </>
                )}
                {!isRoot && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsEditing(true);
                        setShowMenu(false);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-[var(--foreground)]/10 text-left"
                    >
                      <Pencil className="h-4 w-4" />
                      Rename
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete();
                      }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-[var(--foreground)]/10 text-left text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {isFolder && isExpanded && node.children && (
        <div>
          {sortNodes(node.children).map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              activeFileId={activeFileId}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              onFileSelect={onFileSelect}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileExplorer({
  root,
  activeFileId,
  onFileSelect,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
}: FileExplorerProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set([root.id]),
  );

  const toggleFolder = useCallback((id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <div className="h-full flex flex-col bg-[#252526]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--foreground)]/10">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground)]/60">
          Files
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => {
              const name = prompt("Enter file name:", "newfile.tex");
              if (name) {
                const newFile = createFile(name, root.id);
                onCreateFile(root.id, newFile);
              }
            }}
            className="p-1 hover:bg-[var(--foreground)]/10 rounded"
            title="New File"
          >
            <FilePlus className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              const name = prompt("Enter folder name:", "newfolder");
              if (name) {
                const newFolder = createFolder(name, root.id);
                onCreateFolder(root.id, newFolder);
              }
            }}
            className="p-1 hover:bg-[var(--foreground)]/10 rounded"
            title="New Folder"
          >
            <FolderPlus className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto py-1">
        <TreeNode
          node={root}
          depth={0}
          activeFileId={activeFileId}
          expandedFolders={expandedFolders}
          onToggleFolder={toggleFolder}
          onFileSelect={onFileSelect}
          onCreateFile={onCreateFile}
          onCreateFolder={onCreateFolder}
          onRename={onRename}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}
