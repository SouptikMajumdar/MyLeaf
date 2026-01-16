"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Group, Panel, Separator } from "react-resizable-panels";
import {
  Sparkles,
  Play,
  BookOpen,
  FileText,
  PanelLeftClose,
  PanelLeft,
  Users,
  Leaf,
  LogIn,
  X,
} from "lucide-react";
import { MathHelperPanel } from "@/components/ai/MathHelperPanel";
import { CitationFinderPanel } from "@/components/ai/CitationFinderPanel";
import { ConferenceTemplatePanel } from "@/components/ConferenceTemplatePanel";
import FileExplorer from "@/components/FileExplorer";
import { CollaborativeEditor } from "@/components/CollaborativeEditor";
import { PDFViewer } from "@/components/PDFViewer";
import { useAuth } from "@/contexts/AuthContext";
import {
  FileNode,
  createDefaultProject,
  createFile,
  findNode,
  addNode,
  removeNode,
  renameNode,
  updateFileContent,
  isTexFile,
} from "@/types/files";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [showDemoBanner, setShowDemoBanner] = useState(true);

  const [isMathHelperOpen, setMathHelperOpen] = useState(false);
  const [isCitationFinderOpen, setCitationFinderOpen] = useState(false);
  const [isTemplatePanelOpen, setTemplatePanelOpen] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isCollabEnabled, setCollabEnabled] = useState(false);

  // Redirect authenticated users to projects page
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/projects");
    }
  }, [isLoading, isAuthenticated, router]);

  // File system state
  const [projectRoot, setProjectRoot] = useState<FileNode>(() =>
    createDefaultProject(),
  );
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  // Initialize with main.tex as active file
  useEffect(() => {
    if (!activeFileId && projectRoot.children?.length) {
      const mainTex = projectRoot.children.find((f) => f.name === "main.tex");
      if (mainTex) setActiveFileId(mainTex.id);
    }
  }, [activeFileId, projectRoot]);

  // Get current file content
  const activeFile = activeFileId ? findNode(projectRoot, activeFileId) : null;
  const texContent = activeFile?.type === "file" ? activeFile.content ?? "" : "";

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [synctexData, setSynctexData] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);

  // Update file content
  const setTexContent = useCallback(
    (content: string) => {
      if (!activeFileId) return;
      setProjectRoot((prev) => {
        const copy = JSON.parse(JSON.stringify(prev)) as FileNode;
        updateFileContent(copy, activeFileId, content);
        return copy;
      });
    },
    [activeFileId],
  );

  // File operations
  const handleFileSelect = useCallback((file: FileNode) => {
    if (file.type === "file") {
      setActiveFileId(file.id);
    }
  }, []);

  const handleCreateFile = useCallback(
    (parentId: string, file: FileNode) => {
      setProjectRoot((prev) => {
        const copy = JSON.parse(JSON.stringify(prev)) as FileNode;
        addNode(copy, parentId, file);
        return copy;
      });
      // Open the new file if it's a tex file
      if (isTexFile(file.name)) {
        setActiveFileId(file.id);
      }
    },
    [],
  );

  const handleCreateFolder = useCallback(
    (parentId: string, folder: FileNode) => {
      setProjectRoot((prev) => {
        const copy = JSON.parse(JSON.stringify(prev)) as FileNode;
        addNode(copy, parentId, folder);
        return copy;
      });
    },
    [],
  );

  const handleRename = useCallback((id: string, newName: string) => {
    setProjectRoot((prev) => {
      const copy = JSON.parse(JSON.stringify(prev)) as FileNode;
      renameNode(copy, id, newName);
      return copy;
    });
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      // If deleting active file, clear selection
      if (id === activeFileId) {
        setActiveFileId(null);
      }
      setProjectRoot((prev) => {
        const copy = JSON.parse(JSON.stringify(prev)) as FileNode;
        removeNode(copy, id);
        return copy;
      });
    },
    [activeFileId],
  );

  // Apply template: adds all template files to project
  const handleApplyTemplate = useCallback(
    (content: string, files?: { filename: string; content: string }[]) => {
      setProjectRoot((prev) => {
        const copy = JSON.parse(JSON.stringify(prev)) as FileNode;

        // If we have multiple files, add them all
        if (files && files.length > 0) {
          for (const file of files) {
            // Check if file already exists in root
            const existing = copy.children?.find((f) => f.name === file.filename);

            if (existing) {
              // Update existing file
              updateFileContent(copy, existing.id, file.content);
            } else {
              // Create new file
              const newFile = createFile(file.filename, copy.id, file.content);
              if (!copy.children) copy.children = [];
              copy.children.push(newFile);
            }
          }

          // Set main.tex as active if it exists
          const mainTex = copy.children?.find((f) => f.name === "main.tex");
          if (mainTex) {
            setTimeout(() => setActiveFileId(mainTex.id), 0);
          }
        } else {
          // Fallback: just update/create main.tex with the content
          const mainTex = copy.children?.find((f) => f.name === "main.tex");
          if (mainTex) {
            updateFileContent(copy, mainTex.id, content);
            setTimeout(() => setActiveFileId(mainTex.id), 0);
          } else {
            const newFile = createFile("main.tex", copy.id, content);
            if (!copy.children) copy.children = [];
            copy.children.push(newFile);
            setTimeout(() => setActiveFileId(newFile.id), 0);
          }
        }

        return copy;
      });
    },
    [],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "m") {
        e.preventDefault();
        setMathHelperOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "c") {
        e.preventDefault();
        setCitationFinderOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Insert LaTeX from Math Helper (appends to content for now)
  // TODO: Add cursor position insertion support via CodeMirror ref
  const handleInsertLatex = useCallback(
    (latex: string) => {
      setTexContent(texContent + "\n" + latex);
    },
    [texContent, setTexContent],
  );

  // Collect all files from the project tree (flattened)
  const collectProjectFiles = useCallback(
    (node: FileNode): { filename: string; content: string }[] => {
      const files: { filename: string; content: string }[] = [];

      if (node.type === "file" && node.content !== undefined) {
        files.push({ filename: node.name, content: node.content });
      }

      if (node.children) {
        for (const child of node.children) {
          files.push(...collectProjectFiles(child));
        }
      }

      return files;
    },
    [],
  );

  // Compile LaTeX to PDF
  const handleCompile = useCallback(async () => {
    if (!texContent.trim() || isCompiling) return;

    setIsCompiling(true);
    setCompileError(null);

    try {
      // Collect all project files to send to the compiler
      const projectFiles = collectProjectFiles(projectRoot);

      // Determine which file to compile (current active file or main.tex)
      const mainFile = activeFile?.name ?? "main.tex";

      const response = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: projectFiles,
          mainFile,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setCompileError(data.error ?? "Compilation failed");
        return;
      }

      // Get synctex data from header if available
      const synctex = response.headers.get("x-synctex-data");
      setSynctexData(synctex);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(url);
    } catch (err) {
      setCompileError(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsCompiling(false);
    }
  }, [texContent, isCompiling, pdfUrl, projectRoot, activeFile, collectProjectFiles]);

  // Handle SyncTeX source navigation
  const handleSourceClick = useCallback((filename: string, line: number) => {
    // Find the file in the project by name
    const findFileByName = (node: FileNode, name: string): FileNode | null => {
      if (node.type === "file" && node.name === name) return node;
      if (node.children) {
        for (const child of node.children) {
          const found = findFileByName(child, name);
          if (found) return found;
        }
      }
      return null;
    };

    const targetFile = findFileByName(projectRoot, filename);
    if (targetFile) {
      setActiveFileId(targetFile.id);
      // TODO: In the future, scroll the editor to the specific line
      console.log(`Navigating to ${filename}:${line}`);
    } else {
      console.warn(`File not found: ${filename}`);
    }
  }, [projectRoot]);

  return (
    <main className="h-screen w-screen bg-background text-foreground flex flex-col">
      {/* Demo mode banner */}
      {showDemoBanner && !isAuthenticated && (
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-2 text-white text-sm flex items-center justify-center gap-4">
          <span>
            You&apos;re using MyLeaf in demo mode. Your work won&apos;t be saved.
          </span>
          <Link
            href="/login"
            className="flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-md transition-colors"
          >
            <LogIn className="h-4 w-4" />
            Sign in to save
          </Link>
          <button
            onClick={() => setShowDemoBanner(false)}
            className="p-1 hover:bg-white/20 rounded transition-colors"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between border-b border-foreground/10 px-4 py-2">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <Leaf className="h-6 w-6 text-green-600" />
          <span>MyLeaf</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="px-3 py-1.5 text-sm rounded-md hover:bg-foreground/5"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="px-3 py-1.5 text-sm rounded-md bg-green-600 text-white hover:bg-green-700"
          >
            Sign up
          </Link>
        </div>
      </header>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Collapsible File Explorer Sidebar */}
        {isSidebarOpen && (
          <div className="w-60 shrink-0 border-r border-foreground/10">
            <FileExplorer
              root={projectRoot}
              activeFileId={activeFileId}
              onFileSelect={handleFileSelect}
              onCreateFile={handleCreateFile}
              onCreateFolder={handleCreateFolder}
              onRename={handleRename}
              onDelete={handleDelete}
            />
          </div>
        )}

        {/* Main Editor + Preview Area */}
        <div className="flex-1 h-full">
          <Group orientation="horizontal" className="h-full">
            <Panel defaultSize={55} minSize={30} className="h-full">
              <section className="flex h-full flex-col border-r border-foreground/10">
                <header className="flex items-center justify-between border-b border-foreground/10 px-4 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSidebarOpen((prev) => !prev)}
                      className="p-1 rounded hover:bg-foreground/10"
                      title="Toggle Sidebar (⌘B)"
                    >
                      {isSidebarOpen ? (
                        <PanelLeftClose className="h-4 w-4" />
                      ) : (
                        <PanelLeft className="h-4 w-4" />
                      )}
                    </button>
                    <span className="text-sm font-medium">
                      {activeFile?.name ?? "Editor"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Collaboration Toggle */}
                    <button
                      onClick={() => setCollabEnabled((prev) => !prev)}
                      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${isCollabEnabled
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "hover:bg-foreground/10"
                        }`}
                      title={isCollabEnabled ? "Collaboration ON" : "Collaboration OFF"}
                    >
                      <Users className="h-3.5 w-3.5" />
                      {isCollabEnabled ? "Live" : "Solo"}
                    </button>
                    <button
                      onClick={() => setTemplatePanelOpen(true)}
                      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-foreground/10"
                      title="Conference Templates"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Templates
                    </button>
                    <button
                      onClick={() => setMathHelperOpen(true)}
                      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-foreground/10"
                      title="Math Helper (⌘M)"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Math
                    </button>
                    <button
                      onClick={() => setCitationFinderOpen(true)}
                      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-foreground/10"
                      title="Citation Finder (⌘⇧C)"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      Cite
                    </button>
                    <button
                      onClick={handleCompile}
                      disabled={isCompiling || !texContent.trim()}
                      className="flex items-center gap-1.5 rounded-md bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Compile (⌘Enter)"
                    >
                      <Play className="h-3.5 w-3.5" />
                      {isCompiling ? "Compiling..." : "Compile"}
                    </button>
                  </div>
                </header>
                <div className="flex-1 min-h-0 overflow-hidden p-2">
                  {activeFile?.type === "file" ? (
                    <CollaborativeEditor
                      key={`${activeFile.id}-${isCollabEnabled}`}
                      documentId={activeFile.id}
                      initialContent={texContent}
                      onChange={setTexContent}
                      enableCollaboration={isCollabEnabled}
                      className="h-full"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-foreground/50">
                      <div className="text-center">
                        <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                        <p>Select a file to edit</p>
                        <p className="text-xs mt-1">
                          or create a new file using the sidebar
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </Panel>

            <Separator className="w-2 bg-background">
              <div className="mx-auto h-full w-px bg-foreground/15" />
            </Separator>

            <Panel defaultSize={45} minSize={30} className="h-full">
              <section className="flex h-full flex-col">
                <header className="border-b border-foreground/10 px-4 py-2 text-sm font-medium">
                  PDF Preview
                </header>
                <div className="flex flex-1 flex-col min-h-0">
                  {compileError && (
                    <div className="m-2 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
                      {compileError}
                    </div>
                  )}
                  {pdfUrl ? (
                    <PDFViewer
                      url={pdfUrl}
                      synctexData={synctexData ?? undefined}
                      onSourceClick={handleSourceClick}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex flex-1 items-center justify-center p-6">
                      <div className="w-full max-w-md rounded-md border border-foreground/10 p-4 text-center text-sm text-foreground/70">
                        Preview will appear here after compilation.
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </Panel>
          </Group>
        </div>
      </div>

      {/* Math Helper Modal */}
      <MathHelperPanel
        isOpen={isMathHelperOpen}
        onClose={() => setMathHelperOpen(false)}
        onInsert={handleInsertLatex}
      />

      {/* Citation Finder Modal */}
      <CitationFinderPanel
        isOpen={isCitationFinderOpen}
        onClose={() => setCitationFinderOpen(false)}
        onInsert={handleInsertLatex}
      />

      {/* Conference Template Modal */}
      <ConferenceTemplatePanel
        isOpen={isTemplatePanelOpen}
        onClose={() => setTemplatePanelOpen(false)}
        onApplyTemplate={handleApplyTemplate}
      />
    </main>
  );
}
