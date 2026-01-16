"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
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
  ArrowLeft,
  Share2,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { MathHelperPanel } from "@/components/ai/MathHelperPanel";
import { CitationFinderPanel } from "@/components/ai/CitationFinderPanel";
import { ConferenceTemplatePanel } from "@/components/ConferenceTemplatePanel";
import FileExplorer from "@/components/FileExplorer";
import { CollaborativeEditor } from "@/components/CollaborativeEditor";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ShareModal } from "@/components/ShareModal";
import { useAuth } from "@/contexts/AuthContext";
import {
  FileNode,
  findNode,
  addNode,
  removeNode,
  renameNode,
  updateFileContent,
  isTexFile,
} from "@/types/files";
import { ProjectWithRole } from "@/types/project";

type SaveStatus = "saved" | "saving" | "unsaved" | "error";

function ProjectEditorContent() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const projectId = params.projectId as string;

  // Project state
  const [project, setProject] = useState<ProjectWithRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Panel states
  const [isMathHelperOpen, setMathHelperOpen] = useState(false);
  const [isCitationFinderOpen, setCitationFinderOpen] = useState(false);
  const [isTemplatePanelOpen, setTemplatePanelOpen] = useState(false);
  const [isShareModalOpen, setShareModalOpen] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isCollabEnabled, setCollabEnabled] = useState(false);

  // File system state
  const [projectRoot, setProjectRoot] = useState<FileNode | null>(null);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  // Save status
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSaveRef = useRef<{ fileId: string; content: string } | null>(null);

  // PDF preview state
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);

  // Get current file
  const activeFile = activeFileId && projectRoot
    ? findNode(projectRoot, activeFileId)
    : null;
  const texContent = activeFile?.type === "file" ? activeFile.content ?? "" : "";

  // Load project and files
  useEffect(() => {
    async function loadProject() {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch project details
        const projectRes = await fetch(`/api/projects/${projectId}`);
        if (!projectRes.ok) {
          if (projectRes.status === 404) {
            throw new Error("Project not found");
          }
          throw new Error("Failed to load project");
        }
        const projectData = await projectRes.json();
        setProject(projectData.project);

        // Fetch file tree
        const filesRes = await fetch(`/api/projects/${projectId}/files`);
        if (!filesRes.ok) {
          throw new Error("Failed to load files");
        }
        const filesData = await filesRes.json();
        setProjectRoot(filesData.fileTree);

        // Auto-select main.tex if available
        if (filesData.fileTree?.children) {
          const mainTex = filesData.fileTree.children.find(
            (f: FileNode) => f.name === "main.tex"
          );
          if (mainTex) {
            setActiveFileId(mainTex.id);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load project");
      } finally {
        setIsLoading(false);
      }
    }

    loadProject();
  }, [projectId]);

  // Auto-save with debounce
  const saveFile = useCallback(async (fileId: string, content: string) => {
    try {
      setSaveStatus("saving");
      const response = await fetch(`/api/projects/${projectId}/files/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error("Failed to save");
      }

      setSaveStatus("saved");
    } catch (err) {
      console.error("Save error:", err);
      setSaveStatus("error");
    }
  }, [projectId]);

  // Debounced save
  const debouncedSave = useCallback((fileId: string, content: string) => {
    pendingSaveRef.current = { fileId, content };
    setSaveStatus("unsaved");

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (pendingSaveRef.current) {
        saveFile(pendingSaveRef.current.fileId, pendingSaveRef.current.content);
        pendingSaveRef.current = null;
      }
    }, 1000); // 1 second debounce
  }, [saveFile]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // Save any pending changes
      if (pendingSaveRef.current) {
        saveFile(pendingSaveRef.current.fileId, pendingSaveRef.current.content);
      }
    };
  }, [saveFile]);

  // Update file content (local + trigger save)
  const setTexContent = useCallback(
    (content: string) => {
      if (!activeFileId || !projectRoot) return;

      setProjectRoot((prev) => {
        if (!prev) return prev;
        const copy = JSON.parse(JSON.stringify(prev)) as FileNode;
        updateFileContent(copy, activeFileId, content);
        return copy;
      });

      // Trigger debounced save
      debouncedSave(activeFileId, content);
    },
    [activeFileId, projectRoot, debouncedSave]
  );

  // File operations with API calls
  const handleFileSelect = useCallback((file: FileNode) => {
    if (file.type === "file") {
      setActiveFileId(file.id);
    }
  }, []);

  const handleCreateFile = useCallback(
    async (parentId: string, file: FileNode) => {
      try {
        // Determine actual parent ID (root-{projectId} means null for API)
        const apiParentId = parentId.startsWith("root-") ? null : parentId;

        const response = await fetch(`/api/projects/${projectId}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            type: file.type,
            parentId: apiParentId,
            content: file.content,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to create file");
        }

        const data = await response.json();

        // Update local state with server-generated ID
        setProjectRoot((prev) => {
          if (!prev) return prev;
          const copy = JSON.parse(JSON.stringify(prev)) as FileNode;
          const serverFile: FileNode = {
            id: data.file.id,
            name: data.file.name,
            type: data.file.type,
            content: data.file.content,
            parentId: parentId,
            children: data.file.type === "folder" ? [] : undefined,
          };
          addNode(copy, parentId, serverFile);
          return copy;
        });

        // Open the new file if it's a tex file
        if (isTexFile(file.name)) {
          setActiveFileId(data.file.id);
        }
      } catch (err) {
        console.error("Create file error:", err);
        alert("Failed to create file");
      }
    },
    [projectId]
  );

  const handleCreateFolder = useCallback(
    async (parentId: string, folder: FileNode) => {
      try {
        const apiParentId = parentId.startsWith("root-") ? null : parentId;

        const response = await fetch(`/api/projects/${projectId}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: folder.name,
            type: "folder",
            parentId: apiParentId,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to create folder");
        }

        const data = await response.json();

        setProjectRoot((prev) => {
          if (!prev) return prev;
          const copy = JSON.parse(JSON.stringify(prev)) as FileNode;
          const serverFolder: FileNode = {
            id: data.file.id,
            name: data.file.name,
            type: "folder",
            parentId: parentId,
            children: [],
          };
          addNode(copy, parentId, serverFolder);
          return copy;
        });
      } catch (err) {
        console.error("Create folder error:", err);
        alert("Failed to create folder");
      }
    },
    [projectId]
  );

  const handleRename = useCallback(
    async (id: string, newName: string) => {
      // Don't allow renaming the root
      if (id.startsWith("root-")) return;

      try {
        const response = await fetch(`/api/projects/${projectId}/files/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName }),
        });

        if (!response.ok) {
          throw new Error("Failed to rename");
        }

        setProjectRoot((prev) => {
          if (!prev) return prev;
          const copy = JSON.parse(JSON.stringify(prev)) as FileNode;
          renameNode(copy, id, newName);
          return copy;
        });
      } catch (err) {
        console.error("Rename error:", err);
        alert("Failed to rename");
      }
    },
    [projectId]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      // Don't allow deleting the root
      if (id.startsWith("root-")) return;

      try {
        const response = await fetch(`/api/projects/${projectId}/files/${id}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error("Failed to delete");
        }

        // If deleting active file, clear selection
        if (id === activeFileId) {
          setActiveFileId(null);
        }

        setProjectRoot((prev) => {
          if (!prev) return prev;
          const copy = JSON.parse(JSON.stringify(prev)) as FileNode;
          removeNode(copy, id);
          return copy;
        });
      } catch (err) {
        console.error("Delete error:", err);
        alert("Failed to delete");
      }
    },
    [projectId, activeFileId]
  );

  // Apply template
  const handleApplyTemplate = useCallback(
    async (content: string, files?: { filename: string; content: string }[]) => {
      // For templates, we create the files via API
      const filesToCreate = files?.length
        ? files
        : [{ filename: "main.tex", content }];

      for (const file of filesToCreate) {
        try {
          const response = await fetch(`/api/projects/${projectId}/files`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: file.filename,
              type: "file",
              parentId: null,
              content: file.content,
            }),
          });

          if (response.ok) {
            const data = await response.json();

            setProjectRoot((prev) => {
              if (!prev) return prev;
              const copy = JSON.parse(JSON.stringify(prev)) as FileNode;

              // Check if file exists
              const existing = copy.children?.find(f => f.name === file.filename);
              if (existing) {
                updateFileContent(copy, existing.id, file.content);
              } else {
                const serverFile: FileNode = {
                  id: data.file.id,
                  name: data.file.name,
                  type: "file",
                  content: data.file.content,
                  parentId: copy.id,
                };
                if (!copy.children) copy.children = [];
                copy.children.push(serverFile);
              }
              return copy;
            });

            // Select main.tex
            if (file.filename === "main.tex") {
              setActiveFileId(data.file.id);
            }
          }
        } catch (err) {
          console.error("Template apply error:", err);
        }
      }
    },
    [projectId]
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
      // Save shortcut
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (pendingSaveRef.current) {
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
          }
          saveFile(pendingSaveRef.current.fileId, pendingSaveRef.current.content);
          pendingSaveRef.current = null;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveFile]);

  // Insert LaTeX from Math Helper
  const handleInsertLatex = useCallback(
    (latex: string) => {
      setTexContent(texContent + "\n" + latex);
    },
    [texContent, setTexContent]
  );

  // Collect all files from the project tree
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
    []
  );

  // Compile LaTeX to PDF
  const handleCompile = useCallback(async () => {
    if (!texContent.trim() || isCompiling || !projectRoot) return;

    setIsCompiling(true);
    setCompileError(null);

    try {
      const projectFiles = collectProjectFiles(projectRoot);
      const mainFile = activeFile?.name ?? "main.tex";

      const response = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: projectFiles, mainFile }),
      });

      if (!response.ok) {
        const data = await response.json();
        setCompileError(data.error ?? "Compilation failed");
        return;
      }

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

  // Save status indicator
  const SaveStatusIndicator = () => {
    const statusConfig = {
      saved: { icon: Check, text: "Saved", className: "text-green-500" },
      saving: { icon: Loader2, text: "Saving...", className: "text-foreground/50 animate-spin" },
      unsaved: { icon: null, text: "Unsaved", className: "text-yellow-500" },
      error: { icon: AlertCircle, text: "Error saving", className: "text-red-500" },
    };

    const config = statusConfig[saveStatus];
    const Icon = config.icon;

    return (
      <span className={`flex items-center gap-1 text-xs ${config.className}`}>
        {Icon && <Icon className="h-3 w-3" />}
        {config.text}
      </span>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-green-600" />
          <p className="text-foreground/60">Loading project...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !project || !projectRoot) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
          <p className="text-lg font-medium mb-2">Failed to load project</p>
          <p className="text-foreground/60 mb-4">{error || "Project not found"}</p>
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  const isViewer = project.role === "viewer";

  return (
    <main className="h-screen w-screen bg-background text-foreground flex flex-col">
      {/* Top header bar */}
      <header className="flex items-center justify-between border-b border-foreground/10 px-4 py-2">
        <div className="flex items-center gap-4">
          <Link
            href="/projects"
            className="flex items-center gap-2 text-foreground/60 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Link href="/projects" className="flex items-center gap-2 font-semibold">
            <Leaf className="h-5 w-5 text-green-600" />
            <span className="text-foreground/60">/</span>
            <span>{project.name}</span>
          </Link>
          <SaveStatusIndicator />
        </div>
        <div className="flex items-center gap-2">
          {project.role === "owner" && (
            <button
              onClick={() => setShareModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm hover:bg-foreground/5"
            >
              <Share2 className="h-4 w-4" />
              Share
            </button>
          )}
          <span className="text-xs px-2 py-1 rounded-full bg-foreground/5">
            {project.role.charAt(0).toUpperCase() + project.role.slice(1)}
          </span>
        </div>
      </header>

      {/* Main editor area */}
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
                      title="Toggle Sidebar (Cmd+B)"
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
                      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
                        isCollabEnabled
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
                      title="Math Helper (Cmd+M)"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Math
                    </button>
                    <button
                      onClick={() => setCitationFinderOpen(true)}
                      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-foreground/10"
                      title="Citation Finder (Cmd+Shift+C)"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      Cite
                    </button>
                    <button
                      onClick={handleCompile}
                      disabled={isCompiling || !texContent.trim()}
                      className="flex items-center gap-1.5 rounded-md bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Compile"
                    >
                      <Play className="h-3.5 w-3.5" />
                      {isCompiling ? "Compiling..." : "Compile"}
                    </button>
                  </div>
                </header>
                <div className="flex-1 p-2">
                  {activeFile?.type === "file" ? (
                    <CollaborativeEditor
                      key={`${activeFile.id}-${isCollabEnabled}`}
                      documentId={`project:${projectId}:file:${activeFile.id}`}
                      initialContent={texContent}
                      onChange={isViewer ? undefined : setTexContent}
                      enableCollaboration={isCollabEnabled}
                      userName={user?.name || user?.email || "Anonymous"}
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
                <div className="flex flex-1 flex-col">
                  {compileError && (
                    <div className="m-2 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
                      {compileError}
                    </div>
                  )}
                  {pdfUrl ? (
                    <iframe
                      src={pdfUrl}
                      className="h-full w-full"
                      title="PDF Preview"
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

      {/* Modals */}
      <MathHelperPanel
        isOpen={isMathHelperOpen}
        onClose={() => setMathHelperOpen(false)}
        onInsert={handleInsertLatex}
      />

      <CitationFinderPanel
        isOpen={isCitationFinderOpen}
        onClose={() => setCitationFinderOpen(false)}
        onInsert={handleInsertLatex}
      />

      <ConferenceTemplatePanel
        isOpen={isTemplatePanelOpen}
        onClose={() => setTemplatePanelOpen(false)}
        onApplyTemplate={handleApplyTemplate}
      />

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setShareModalOpen(false)}
        projectId={projectId}
      />
    </main>
  );
}

export default function ProjectEditorPage() {
  return (
    <ProtectedRoute>
      <ProjectEditorContent />
    </ProtectedRoute>
  );
}
