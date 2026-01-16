"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Leaf, User, LogOut, FolderOpen, Share2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface HeaderProps {
  projectName?: string;
  projectId?: string;
  showShare?: boolean;
  onShareClick?: () => void;
}

export function Header({
  projectName,
  projectId,
  showShare,
  onShareClick,
}: HeaderProps) {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <header className="flex items-center justify-between border-b border-foreground/10 px-4 py-2 bg-background">
      <div className="flex items-center gap-4">
        <Link
          href={isAuthenticated ? "/projects" : "/"}
          className="flex items-center gap-2 font-bold"
        >
          <Leaf className="h-6 w-6 text-green-600" />
          <span>MyLeaf</span>
        </Link>

        {projectName && (
          <>
            <span className="text-foreground/30">/</span>
            <Link
              href={`/projects/${projectId}`}
              className="text-foreground/80 hover:text-foreground"
            >
              {projectName}
            </Link>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {showShare && onShareClick && (
          <button
            onClick={onShareClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm hover:bg-foreground/5"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
        )}

        {isAuthenticated ? (
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-foreground/5"
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-6 w-6 rounded-full"
                />
              ) : (
                <div className="h-6 w-6 rounded-full bg-foreground/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-foreground/50" />
                </div>
              )}
              <span className="text-sm hidden sm:inline">
                {user?.name || user?.email?.split("@")[0]}
              </span>
            </button>

            {showUserMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowUserMenu(false)}
                />
                <div className="absolute right-0 mt-1 w-48 bg-background border border-foreground/10 rounded-md shadow-lg z-20">
                  <div className="px-3 py-2 border-b border-foreground/10">
                    <p className="text-sm font-medium truncate">
                      {user?.name || "User"}
                    </p>
                    <p className="text-xs text-foreground/50 truncate">
                      {user?.email}
                    </p>
                  </div>
                  <Link
                    href="/projects"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-foreground/5"
                  >
                    <FolderOpen className="h-4 w-4" />
                    My Projects
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-foreground/5"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
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
        )}
      </div>
    </header>
  );
}
