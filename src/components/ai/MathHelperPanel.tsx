"use client";

import { useState, useCallback } from "react";
import { X, Sparkles, Copy, Check, Loader2 } from "lucide-react";
import { clsx } from "clsx";

interface MathHelperPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert?: (latex: string) => void;
}

export function MathHelperPanel({ isOpen, onClose, onInsert }: MathHelperPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setError("");
    setResult("");

    try {
      const response = await fetch("/api/ai/math", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Failed to generate LaTeX");
        return;
      }

      setResult(data.latex ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsLoading(false);
    }
  }, [prompt, isLoading]);

  const handleCopy = useCallback(async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result]);

  const handleInsert = useCallback(() => {
    if (result && onInsert) {
      onInsert(result);
      onClose();
    }
  }, [result, onInsert, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleGenerate();
      }
      if (e.key === "Escape") {
        onClose();
      }
    },
    [handleGenerate, onClose]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="w-full max-w-lg rounded-lg border border-foreground/10 bg-background p-4 shadow-xl"
        role="dialog"
        aria-labelledby="math-helper-title"
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="math-helper-title"
            className="flex items-center gap-2 text-lg font-semibold"
          >
            <Sparkles className="h-5 w-5 text-blue-500" />
            Math Expression Helper
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-foreground/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Input */}
        <div className="mb-4">
          <label htmlFor="math-prompt" className="mb-1 block text-sm text-foreground/70">
            Describe the math in plain English
          </label>
          <textarea
            id="math-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., integral of x squared from 0 to infinity"
            className="h-24 w-full resize-none rounded-md border border-foreground/10 bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
            autoFocus
          />
          <p className="mt-1 text-xs text-foreground/50">
            Press <kbd className="rounded bg-foreground/10 px-1">⌘</kbd>+
            <kbd className="rounded bg-foreground/10 px-1">Enter</kbd> to generate
          </p>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || isLoading}
          className={clsx(
            "mb-4 flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            prompt.trim() && !isLoading
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "cursor-not-allowed bg-foreground/10 text-foreground/50"
          )}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate LaTeX
            </>
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="rounded-md border border-foreground/10 bg-foreground/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-foreground/70">Generated LaTeX</span>
              <div className="flex gap-1">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-foreground/10"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-green-500" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </button>
                {onInsert && (
                  <button
                    onClick={handleInsert}
                    className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                  >
                    Insert
                  </button>
                )}
              </div>
            </div>
            <pre className="overflow-x-auto font-mono text-sm">{result}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
