"use client";

import { useState, useCallback, useEffect } from "react";
import { X, FileText, Download, Loader2, ExternalLink, Check, AlertTriangle } from "lucide-react";
import { clsx } from "clsx";

interface Template {
  id: string;
  name: string;
  shortName: string;
  category: string;
  description: string;
  website: string;
}

interface TemplateFile {
  filename: string;
  content: string;
}

interface TemplateResponse {
  id: string;
  name: string;
  files: TemplateFile[];
  sourceUrl?: string;
  isFallback: boolean;
}

interface ConferenceTemplatePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyTemplate?: (content: string, files?: TemplateFile[]) => void;
}

const CATEGORIES = {
  ml: { name: "Machine Learning", icon: "🤖" },
  nlp: { name: "NLP", icon: "💬" },
  vision: { name: "Computer Vision", icon: "👁️" },
  general: { name: "General", icon: "📄" },
  journal: { name: "Journals", icon: "📚" },
} as const;

type CategoryKey = keyof typeof CATEGORIES;

export function ConferenceTemplatePanel({
  isOpen,
  onClose,
  onApplyTemplate,
}: ConferenceTemplatePanelProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | "all">("all");
  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(null);
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null);
  const [lastFetchResult, setLastFetchResult] = useState<{
    isFallback: boolean;
    sourceUrl?: string;
  } | null>(null);
  const [error, setError] = useState("");

  // Fetch template list on open
  useEffect(() => {
    if (!isOpen) return;

    const fetchTemplates = async () => {
      setIsLoadingList(true);
      setError("");
      try {
        const response = await fetch("/api/templates");
        const data = await response.json();
        if (!response.ok) {
          setError(data.error ?? "Failed to load templates");
          return;
        }
        setTemplates(data.templates ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setIsLoadingList(false);
      }
    };

    fetchTemplates();
  }, [isOpen]);

  const handleApplyTemplate = useCallback(
    async (template: Template) => {
      setLoadingTemplateId(template.id);
      setError("");
      setLastFetchResult(null);

      try {
        const response = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: template.id }),
        });

        const data = (await response.json()) as TemplateResponse & { error?: string };

        if (!response.ok) {
          setError(data.error ?? "Failed to fetch template");
          return;
        }

        // Find the main.tex file
        const mainFile = data.files?.find(
          (f: TemplateFile) => f.filename === "main.tex"
        );

        if (mainFile && onApplyTemplate) {
          onApplyTemplate(mainFile.content, data.files);
          setAppliedTemplateId(template.id);
          setLastFetchResult({
            isFallback: data.isFallback,
            sourceUrl: data.sourceUrl,
          });
          setTimeout(() => {
            setAppliedTemplateId(null);
            setLastFetchResult(null);
          }, 4000);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setLoadingTemplateId(null);
      }
    },
    [onApplyTemplate]
  );

  const filteredTemplates =
    selectedCategory === "all"
      ? templates
      : templates.filter((t) => t.category === selectedCategory);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="flex h-[80vh] w-full max-w-3xl flex-col rounded-lg border border-foreground/10 bg-background shadow-xl"
        role="dialog"
        aria-labelledby="template-panel-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
          <h2
            id="template-panel-title"
            className="flex items-center gap-2 text-lg font-semibold"
          >
            <FileText className="h-5 w-5 text-orange-500" />
            Conference Templates
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-foreground/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 overflow-x-auto border-b border-foreground/10 px-4 py-2">
          <button
            onClick={() => setSelectedCategory("all")}
            className={clsx(
              "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              selectedCategory === "all"
                ? "bg-orange-600 text-white"
                : "bg-foreground/5 hover:bg-foreground/10"
            )}
          >
            All
          </button>
          {(Object.keys(CATEGORIES) as CategoryKey[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={clsx(
                "flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                selectedCategory === cat
                  ? "bg-orange-600 text-white"
                  : "bg-foreground/5 hover:bg-foreground/10"
              )}
            >
              <span>{CATEGORIES[cat].icon}</span>
              {CATEGORIES[cat].name}
            </button>
          ))}
        </div>

        {/* Templates List */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {isLoadingList ? (
            <div className="flex flex-col items-center justify-center py-12 text-foreground/70">
              <Loader2 className="mb-2 h-8 w-8 animate-spin" />
              <p className="text-sm">Loading templates...</p>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-foreground/50">
              <FileText className="mb-2 h-12 w-12 opacity-30" />
              <p className="text-sm">No templates found</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  className="flex flex-col rounded-lg border border-foreground/10 p-4 transition-colors hover:border-foreground/20"
                >
                  {/* Header */}
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <h3 className="font-medium">{template.name}</h3>
                    </div>
                    <span className="text-lg">
                      {CATEGORIES[template.category as CategoryKey]?.icon ?? "📄"}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="mb-3 flex-1 text-xs text-foreground/70">
                    {template.description}
                  </p>

                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleApplyTemplate(template)}
                        disabled={loadingTemplateId === template.id}
                        className={clsx(
                          "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                          appliedTemplateId === template.id
                            ? "bg-green-600 text-white"
                            : loadingTemplateId === template.id
                              ? "cursor-wait bg-orange-600/70 text-white"
                              : "bg-orange-600 text-white hover:bg-orange-700"
                        )}
                      >
                        {appliedTemplateId === template.id ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Applied!
                          </>
                        ) : loadingTemplateId === template.id ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Fetching...
                          </>
                        ) : (
                          <>
                            <Download className="h-3.5 w-3.5" />
                            Use Template
                          </>
                        )}
                      </button>
                      <a
                        href={template.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md p-1.5 hover:bg-foreground/10"
                        title="Visit conference website"
                      >
                        <ExternalLink className="h-4 w-4 text-foreground/50" />
                      </a>
                    </div>
                    {/* Show source info after applying */}
                    {appliedTemplateId === template.id && lastFetchResult && (
                      <div className={clsx(
                        "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs",
                        lastFetchResult.isFallback
                          ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                          : "bg-green-500/10 text-green-600 dark:text-green-400"
                      )}>
                        {lastFetchResult.isFallback ? (
                          <>
                            <AlertTriangle className="h-3 w-3" />
                            Using fallback template. Visit website for official version.
                          </>
                        ) : (
                          <>
                            <Check className="h-3 w-3" />
                            Fetched from {lastFetchResult.sourceUrl ? (
                              <a
                                href={lastFetchResult.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:no-underline"
                              >
                                source
                              </a>
                            ) : "official source"}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-foreground/10 px-4 py-2 text-center text-xs text-foreground/50">
          Templates are scraped from GitHub repos and official sources. Cached for 1 hour.
        </div>
      </div>
    </div>
  );
}
