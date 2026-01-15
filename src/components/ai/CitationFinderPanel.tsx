"use client";

import { useState, useCallback } from "react";
import { X, Search, BookOpen, Copy, Check, Loader2, ExternalLink } from "lucide-react";
import { clsx } from "clsx";

interface Citation {
  title: string;
  authors: string[];
  year: number | null;
  abstract: string;
  citationCount: number;
  doi: string | null;
  arxivId: string | null;
  url: string;
  bibtex: string;
  relevance?: string;
}

interface CitationFinderPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert?: (bibtex: string) => void;
}

export function CitationFinderPanel({ isOpen, onClose, onInsert }: CitationFinderPanelProps) {
  const [query, setQuery] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setError("");
    setCitations([]);

    try {
      const response = await fetch("/api/ai/citations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Failed to find citations");
        return;
      }

      if (data.citations?.length === 0) {
        setError("No papers found. Try a different query.");
        return;
      }

      setCitations(data.citations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsLoading(false);
    }
  }, [query, isLoading]);

  const handleCopy = useCallback(async (bibtex: string, index: number) => {
    await navigator.clipboard.writeText(bibtex);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  const handleInsert = useCallback((bibtex: string) => {
    if (onInsert) {
      onInsert(bibtex + "\n\n");
      onClose();
    }
  }, [onInsert, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSearch();
      }
      if (e.key === "Escape") {
        onClose();
      }
    },
    [handleSearch, onClose]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="flex h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-foreground/10 bg-background shadow-xl"
        role="dialog"
        aria-labelledby="citation-finder-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
          <h2
            id="citation-finder-title"
            className="flex items-center gap-2 text-lg font-semibold"
          >
            <BookOpen className="h-5 w-5 text-purple-500" />
            Citation Finder
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-foreground/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="border-b border-foreground/10 p-4">
          <label htmlFor="citation-query" className="mb-1 block text-sm text-foreground/70">
            Describe a claim or topic to find supporting papers
          </label>
          <div className="flex gap-2">
            <input
              id="citation-query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g., Transformers outperform RNNs on long sequences"
              className="flex-1 rounded-md border border-foreground/10 bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50"
              autoFocus
            />
            <button
              onClick={handleSearch}
              disabled={!query.trim() || isLoading}
              className={clsx(
                "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                query.trim() && !isLoading
                  ? "bg-purple-600 text-white hover:bg-purple-700"
                  : "cursor-not-allowed bg-foreground/10 text-foreground/50"
              )}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Search
            </button>
          </div>
          <p className="mt-1 text-xs text-foreground/50">
            Press <kbd className="rounded bg-foreground/10 px-1">⌘</kbd>+
            <kbd className="rounded bg-foreground/10 px-1">Enter</kbd> to search
          </p>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-foreground/70">
              <Loader2 className="mb-2 h-8 w-8 animate-spin" />
              <p className="text-sm">Searching academic databases...</p>
              <p className="text-xs text-foreground/50">This may take a few seconds</p>
            </div>
          )}

          {!isLoading && citations.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-foreground/50">
                Found {citations.length} relevant papers
              </p>
              {citations.map((citation, index) => (
                <div
                  key={index}
                  className="rounded-md border border-foreground/10 p-3"
                >
                  {/* Title & Year */}
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <h3 className="font-medium leading-tight">{citation.title}</h3>
                    {citation.year && (
                      <span className="shrink-0 text-xs text-foreground/50">
                        {citation.year}
                      </span>
                    )}
                  </div>

                  {/* Authors */}
                  <p className="mb-2 text-xs text-foreground/70">
                    {citation.authors.slice(0, 3).join(", ")}
                    {citation.authors.length > 3 && " et al."}
                  </p>

                  {/* Citation count & relevance */}
                  <div className="mb-2 flex items-center gap-3 text-xs text-foreground/50">
                    <span>{citation.citationCount} citations</span>
                    {citation.url && (
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-purple-500 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View
                      </a>
                    )}
                  </div>

                  {/* Relevance explanation */}
                  {citation.relevance && (
                    <p className="mb-2 rounded bg-purple-500/10 px-2 py-1 text-xs text-purple-700 dark:text-purple-300">
                      {citation.relevance}
                    </p>
                  )}

                  {/* Abstract (expandable) */}
                  {citation.abstract && (
                    <div className="mb-2">
                      <button
                        onClick={() =>
                          setExpandedIndex(expandedIndex === index ? null : index)
                        }
                        className="text-xs text-foreground/50 hover:text-foreground/70"
                      >
                        {expandedIndex === index ? "Hide abstract" : "Show abstract"}
                      </button>
                      {expandedIndex === index && (
                        <p className="mt-1 text-xs text-foreground/70">
                          {citation.abstract}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopy(citation.bibtex, index)}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-foreground/10"
                    >
                      {copiedIndex === index ? (
                        <>
                          <Check className="h-3 w-3 text-green-500" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          Copy BibTeX
                        </>
                      )}
                    </button>
                    {onInsert && (
                      <button
                        onClick={() => handleInsert(citation.bibtex)}
                        className="rounded bg-purple-600 px-2 py-1 text-xs text-white hover:bg-purple-700"
                      >
                        Insert
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && !error && citations.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-foreground/50">
              <BookOpen className="mb-2 h-12 w-12 opacity-30" />
              <p className="text-sm">Describe a claim to find supporting papers</p>
              <p className="text-xs">Results from Semantic Scholar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
