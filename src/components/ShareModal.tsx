"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Mail, Trash2, User, Crown, Edit3, Eye } from "lucide-react";
import { ProjectCollaborator } from "@/types/project";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

interface ProjectOwner {
  id: string;
  name: string | null;
  email: string;
}

export function ShareModal({ isOpen, onClose, projectId }: ShareModalProps) {
  const [collaborators, setCollaborators] = useState<ProjectCollaborator[]>([]);
  const [owner, setOwner] = useState<ProjectOwner | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Fetch collaborators
  const fetchCollaborators = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        `/api/projects/${projectId}/collaborators`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch collaborators");
      }

      const data = await response.json();
      setCollaborators(data.collaborators);
      setOwner(data.owner);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen) {
      fetchCollaborators();
    }
  }, [isOpen, fetchCollaborators]);

  // Invite collaborator
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsInviting(true);
    setInviteError(null);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/collaborators`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), role }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to invite");
      }

      setCollaborators(data.collaborators);
      setEmail("");
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to invite");
    } finally {
      setIsInviting(false);
    }
  };

  // Remove collaborator
  const handleRemove = async (userId: string) => {
    if (!confirm("Remove this collaborator?")) return;

    try {
      const response = await fetch(
        `/api/projects/${projectId}/collaborators/${userId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("Failed to remove collaborator");
      }

      const data = await response.json();
      setCollaborators(data.collaborators);
    } catch (err) {
      console.error("Remove error:", err);
      alert("Failed to remove collaborator");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background border border-foreground/10 rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/10">
          <h2 className="text-lg font-semibold">Share Project</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-foreground/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Invite form */}
          <form onSubmit={handleInvite} className="mb-6">
            <label className="block text-sm font-medium text-foreground/80 mb-2">
              Invite by email
            </label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  className="w-full pl-9 pr-3 py-2 rounded-md border border-foreground/20 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-green-600/50"
                />
              </div>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
                className="px-3 py-2 rounded-md border border-foreground/20 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-green-600/50"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            {inviteError && (
              <p className="mt-2 text-sm text-red-500">{inviteError}</p>
            )}
            <button
              type="submit"
              disabled={isInviting || !email.trim()}
              className="mt-3 w-full py-2 px-4 rounded-md bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isInviting ? "Inviting..." : "Send Invite"}
            </button>
          </form>

          {/* Collaborators list */}
          <div>
            <h3 className="text-sm font-medium text-foreground/80 mb-3">
              People with access
            </h3>

            {isLoading ? (
              <p className="text-sm text-foreground/50 text-center py-4">
                Loading...
              </p>
            ) : error ? (
              <p className="text-sm text-red-500 text-center py-4">{error}</p>
            ) : (
              <div className="space-y-2">
                {/* Owner */}
                {owner && (
                  <div className="flex items-center gap-3 p-2 rounded-md bg-foreground/5">
                    <div className="h-8 w-8 rounded-full bg-green-600 flex items-center justify-center">
                      <Crown className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {owner.name || owner.email}
                      </p>
                      <p className="text-xs text-foreground/50 truncate">
                        {owner.email}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      Owner
                    </span>
                  </div>
                )}

                {/* Collaborators */}
                {collaborators.map((collab) => (
                  <div
                    key={collab.id}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-foreground/5 group"
                  >
                    <div className="h-8 w-8 rounded-full bg-foreground/10 flex items-center justify-center">
                      {collab.user.avatarUrl ? (
                        <img
                          src={collab.user.avatarUrl}
                          alt=""
                          className="h-8 w-8 rounded-full"
                        />
                      ) : (
                        <User className="h-4 w-4 text-foreground/50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {collab.user.name || collab.user.email}
                      </p>
                      <p className="text-xs text-foreground/50 truncate">
                        {collab.user.email}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-foreground/5">
                        {collab.role === "editor" ? (
                          <>
                            <Edit3 className="h-3 w-3" />
                            Editor
                          </>
                        ) : (
                          <>
                            <Eye className="h-3 w-3" />
                            Viewer
                          </>
                        )}
                      </span>
                      <button
                        onClick={() => handleRemove(collab.userId)}
                        className="p-1 rounded text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 transition-opacity"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {collaborators.length === 0 && (
                  <p className="text-sm text-foreground/50 text-center py-4">
                    No collaborators yet. Invite someone above!
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
