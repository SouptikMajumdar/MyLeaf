"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { findSourceLocation } from "@/lib/synctex-parser";

// Import pdf.js dynamically to avoid SSR issues
let pdfjsLib: typeof import("pdfjs-dist") | null = null;

async function loadPdfJs() {
    if (!pdfjsLib) {
        pdfjsLib = await import("pdfjs-dist");
        // Use unpkg for reliable worker loading with exact version
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    }
    return pdfjsLib;
}

export interface PDFViewerProps {
    /** URL or blob URL of the PDF to display */
    url: string;
    /** Base64 encoded gzipped SyncTeX data */
    synctexData?: string;
    /** Callback when user clicks on a location that maps to source */
    onSourceClick?: (file: string, line: number) => void;
    /** CSS class name */
    className?: string;
}

export function PDFViewer({
    url,
    synctexData,
    onSourceClick,
    className = "",
}: PDFViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const [pdf, setPdf] = useState<import("pdfjs-dist").PDFDocumentProxy | null>(null);
    const [totalPages, setTotalPages] = useState(0);
    const [scale, setScale] = useState(1.5); // Higher default for better quality
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [renderedPages, setRenderedPages] = useState<Map<number, HTMLCanvasElement>>(new Map());

    // Device pixel ratio for high-DPI displays
    const devicePixelRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    // Load PDF document
    useEffect(() => {
        let cancelled = false;

        async function loadPdf() {
            try {
                setIsLoading(true);
                setError(null);
                setRenderedPages(new Map());

                const pdfjs = await loadPdfJs();
                const loadingTask = pdfjs.getDocument(url);
                const pdfDoc = await loadingTask.promise;

                if (cancelled) return;

                setPdf(pdfDoc);
                setTotalPages(pdfDoc.numPages);
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Failed to load PDF");
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        loadPdf();

        return () => {
            cancelled = true;
        };
    }, [url]);

    // Render all pages
    useEffect(() => {
        if (!pdf || !containerRef.current) return;

        let cancelled = false;

        async function renderAllPages() {
            const newRenderedPages = new Map<number, HTMLCanvasElement>();

            for (let pageNum = 1; pageNum <= pdf!.numPages; pageNum++) {
                if (cancelled) break;

                const page = await pdf!.getPage(pageNum);
                const viewport = page.getViewport({ scale });

                // Create high-resolution canvas
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d");
                if (!context) continue;

                // Scale canvas for high-DPI displays
                const outputScale = devicePixelRatio;
                canvas.width = Math.floor(viewport.width * outputScale);
                canvas.height = Math.floor(viewport.height * outputScale);
                canvas.style.width = `${Math.floor(viewport.width)}px`;
                canvas.style.height = `${Math.floor(viewport.height)}px`;

                // Store page info for SyncTeX
                canvas.dataset.pageNum = String(pageNum);
                canvas.dataset.pageHeight = String(viewport.height / scale);
                canvas.dataset.scale = String(scale);

                const transform = outputScale !== 1
                    ? [outputScale, 0, 0, outputScale, 0, 0]
                    : undefined;

                await page.render({
                    canvasContext: context,
                    viewport,
                    transform,
                }).promise;

                newRenderedPages.set(pageNum, canvas);
            }

            if (!cancelled) {
                setRenderedPages(newRenderedPages);
            }
        }

        renderAllPages();

        return () => {
            cancelled = true;
        };
    }, [pdf, scale, devicePixelRatio]);

    // Handle double-click for SyncTeX
    const handleDoubleClick = useCallback(
        async (e: React.MouseEvent<HTMLDivElement>) => {
            if (!synctexData || !onSourceClick) return;

            const target = e.target as HTMLElement;
            const canvas = target.closest("canvas") as HTMLCanvasElement | null;
            if (!canvas) return;

            const pageNum = parseInt(canvas.dataset.pageNum || "1");
            const pageHeight = parseFloat(canvas.dataset.pageHeight || "792");
            const canvasScale = parseFloat(canvas.dataset.scale || "1");

            const rect = canvas.getBoundingClientRect();
            const displayScale = canvas.clientWidth / (parseFloat(canvas.style.width) || canvas.clientWidth);

            // Convert click position to PDF coordinates
            const clickX = (e.clientX - rect.left) / canvasScale / displayScale;
            const clickY = (e.clientY - rect.top) / canvasScale / displayScale;

            // Find source location
            const result = await findSourceLocation(
                synctexData,
                pageNum,
                clickX,
                clickY,
                pageHeight
            );

            if (result) {
                onSourceClick(result.file, result.line);
            }
        },
        [synctexData, onSourceClick]
    );

    // Zoom controls
    const zoomIn = () => setScale((s) => Math.min(4, s + 0.25));
    const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.25));
    const fitWidth = () => {
        if (containerRef.current && pdf) {
            // Calculate scale to fit container width
            const containerWidth = containerRef.current.clientWidth - 48; // padding
            pdf.getPage(1).then((page) => {
                const viewport = page.getViewport({ scale: 1 });
                const newScale = containerWidth / viewport.width;
                setScale(Math.max(0.5, Math.min(4, newScale)));
            });
        }
    };

    if (error) {
        return (
            <div className={`flex items-center justify-center h-full ${className}`}>
                <div className="text-red-500 text-sm">{error}</div>
            </div>
        );
    }

    return (
        <div className={`flex flex-col h-full ${className}`} ref={containerRef}>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-foreground/10 bg-background/50 shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-foreground/60">
                        {totalPages > 0 ? `${totalPages} page${totalPages > 1 ? "s" : ""}` : "Loading..."}
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={zoomOut}
                        className="p-1 rounded hover:bg-foreground/10"
                        title="Zoom out"
                    >
                        <ZoomOut className="h-4 w-4" />
                    </button>
                    <span className="text-xs tabular-nums w-12 text-center">
                        {Math.round(scale * 100)}%
                    </span>
                    <button
                        onClick={zoomIn}
                        className="p-1 rounded hover:bg-foreground/10"
                        title="Zoom in"
                    >
                        <ZoomIn className="h-4 w-4" />
                    </button>
                    <button
                        onClick={fitWidth}
                        className="p-1 rounded hover:bg-foreground/10 ml-1"
                        title="Fit to width"
                    >
                        <Maximize2 className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Scrollable PDF Container */}
            <div
                ref={scrollContainerRef}
                className="flex-1 overflow-auto bg-neutral-800"
                onDoubleClick={handleDoubleClick}
            >
                {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="animate-spin h-8 w-8 border-2 border-foreground/20 border-t-foreground rounded-full" />
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-4 p-4">
                        {Array.from(renderedPages.entries())
                            .sort(([a], [b]) => a - b)
                            .map(([pageNum, canvas]) => (
                                <div
                                    key={pageNum}
                                    className="shadow-lg bg-white"
                                    ref={(el) => {
                                        if (el && !el.contains(canvas)) {
                                            el.innerHTML = "";
                                            el.appendChild(canvas);
                                        }
                                    }}
                                    style={{
                                        width: canvas.style.width,
                                        height: canvas.style.height,
                                    }}
                                />
                            ))}
                    </div>
                )}
            </div>

            {/* SyncTeX hint */}
            {synctexData && (
                <div className="text-center text-xs text-foreground/40 py-1 border-t border-foreground/10 shrink-0">
                    Double-click to jump to source
                </div>
            )}
        </div>
    );
}

export default PDFViewer;
