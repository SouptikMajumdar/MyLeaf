"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { findSourceLocation } from "@/lib/synctex-parser";

// Import pdf.js dynamically to avoid SSR issues
let pdfjsLib: typeof import("pdfjs-dist") | null = null;

async function loadPdfJs() {
    if (!pdfjsLib) {
        pdfjsLib = await import("pdfjs-dist");
        // Set worker path
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
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
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [pdf, setPdf] = useState<import("pdfjs-dist").PDFDocumentProxy | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [scale, setScale] = useState(1.0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Load PDF document
    useEffect(() => {
        let cancelled = false;

        async function loadPdf() {
            try {
                setIsLoading(true);
                setError(null);

                const pdfjs = await loadPdfJs();
                const loadingTask = pdfjs.getDocument(url);
                const pdfDoc = await loadingTask.promise;

                if (cancelled) return;

                setPdf(pdfDoc);
                setTotalPages(pdfDoc.numPages);
                setCurrentPage(1);
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

    // Render current page
    useEffect(() => {
        if (!pdf || !canvasRef.current) return;

        let cancelled = false;

        async function renderPage() {
            const page = await pdf!.getPage(currentPage);
            if (cancelled) return;

            const canvas = canvasRef.current!;
            const context = canvas.getContext("2d");
            if (!context) return;

            // Calculate scale to fit width
            const container = containerRef.current;
            const containerWidth = container?.clientWidth || 800;
            const viewport = page.getViewport({ scale: 1 });
            const fitScale = (containerWidth - 32) / viewport.width; // 32px for padding
            const actualScale = scale === 1.0 ? fitScale : scale;

            const scaledViewport = page.getViewport({ scale: actualScale });

            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;

            // Store page dimensions for SyncTeX calculations
            canvas.dataset.pageHeight = String(viewport.height);
            canvas.dataset.scale = String(actualScale);

            await page.render({
                canvasContext: context,
                viewport: scaledViewport,
            }).promise;
        }

        renderPage();

        return () => {
            cancelled = true;
        };
    }, [pdf, currentPage, scale]);

    // Handle double-click for SyncTeX
    const handleDoubleClick = useCallback(
        async (e: React.MouseEvent<HTMLCanvasElement>) => {
            if (!synctexData || !onSourceClick || !canvasRef.current) return;

            const canvas = canvasRef.current;
            const rect = canvas.getBoundingClientRect();
            const canvasScale = parseFloat(canvas.dataset.scale || "1");
            const pageHeight = parseFloat(canvas.dataset.pageHeight || "792");

            // Convert click position to PDF coordinates
            const clickX = (e.clientX - rect.left) / canvasScale;
            const clickY = (e.clientY - rect.top) / canvasScale;

            // Find source location
            const result = await findSourceLocation(
                synctexData,
                currentPage,
                clickX,
                clickY,
                pageHeight
            );

            if (result) {
                onSourceClick(result.file, result.line);
            }
        },
        [synctexData, onSourceClick, currentPage]
    );

    // Navigation
    const prevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
    const nextPage = () => setCurrentPage((p) => Math.min(totalPages, p + 1));

    // Zoom
    const zoomIn = () => setScale((s) => Math.min(3, s + 0.25));
    const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.25));
    const fitWidth = () => setScale(1.0);

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
            <div className="flex items-center justify-between px-3 py-2 border-b border-foreground/10 bg-background/50">
                <div className="flex items-center gap-2">
                    <button
                        onClick={prevPage}
                        disabled={currentPage <= 1}
                        className="p-1 rounded hover:bg-foreground/10 disabled:opacity-30"
                        title="Previous page"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-xs tabular-nums">
                        {currentPage} / {totalPages}
                    </span>
                    <button
                        onClick={nextPage}
                        disabled={currentPage >= totalPages}
                        className="p-1 rounded hover:bg-foreground/10 disabled:opacity-30"
                        title="Next page"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
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

            {/* PDF Canvas */}
            <div className="flex-1 overflow-auto bg-neutral-800 flex justify-center p-4">
                {isLoading ? (
                    <div className="flex items-center justify-center">
                        <div className="animate-spin h-8 w-8 border-2 border-foreground/20 border-t-foreground rounded-full" />
                    </div>
                ) : (
                    <canvas
                        ref={canvasRef}
                        onDoubleClick={handleDoubleClick}
                        className="shadow-lg cursor-crosshair"
                        title={synctexData ? "Double-click to jump to source" : undefined}
                    />
                )}
            </div>

            {/* SyncTeX hint */}
            {synctexData && (
                <div className="text-center text-xs text-foreground/40 py-1 border-t border-foreground/10">
                    Double-click to jump to source
                </div>
            )}
        </div>
    );
}

export default PDFViewer;
