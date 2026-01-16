/**
 * SyncTeX Parser - Client-side parsing of SyncTeX data
 * 
 * SyncTeX maps PDF coordinates to source file locations.
 * This parser handles the compressed synctex.gz format.
 */

// Decompress gzipped data (use pako or browser API)
async function decompressGzip(base64Data: string): Promise<string> {
    try {
        // Decode base64 to binary
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Decompress using DecompressionStream (modern browsers)
        const ds = new DecompressionStream('gzip');
        const writer = ds.writable.getWriter();
        writer.write(bytes);
        writer.close();

        const reader = ds.readable.getReader();
        const chunks: Uint8Array[] = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }

        // Combine chunks
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }

        return new TextDecoder().decode(result);
    } catch (error) {
        console.error('Failed to decompress synctex data:', error);
        return '';
    }
}

export interface SyncTeXEntry {
    file: string;
    line: number;
    column: number;
    page: number;
    x: number;      // PDF coordinates (scaled points)
    y: number;
    width: number;
    height: number;
}

export interface SyncTeXData {
    entries: SyncTeXEntry[];
    files: Map<number, string>;
    magnification: number;
    xOffset: number;
    yOffset: number;
}

/**
 * Parse SyncTeX content into structured data
 */
function parseSyncTeXContent(content: string): SyncTeXData {
    const entries: SyncTeXEntry[] = [];
    const files = new Map<number, string>();
    const lines = content.split('\n');

    let magnification = 1000;
    let xOffset = 0;
    let yOffset = 0;
    let currentPage = 0;
    let currentFile = '';
    let currentFileIndex = 0;

    for (const line of lines) {
        // SyncTeX preamble
        if (line.startsWith('Magnification:')) {
            magnification = parseInt(line.split(':')[1]) || 1000;
            continue;
        }
        if (line.startsWith('X Offset:')) {
            xOffset = parseInt(line.split(':')[1]) || 0;
            continue;
        }
        if (line.startsWith('Y Offset:')) {
            yOffset = parseInt(line.split(':')[1]) || 0;
            continue;
        }

        // Input file declaration: Input:n:filename
        if (line.startsWith('Input:')) {
            const match = line.match(/^Input:(\d+):(.+)$/);
            if (match) {
                files.set(parseInt(match[1]), match[2]);
            }
            continue;
        }

        // Page boundary: {n or }n
        if (line.startsWith('{')) {
            const match = line.match(/^\{(\d+)$/);
            if (match) {
                currentPage = parseInt(match[1]);
            }
            continue;
        }

        // File reference in content: (n or )n
        if (line.match(/^\((\d+)$/)) {
            currentFileIndex = parseInt(line.slice(1));
            currentFile = files.get(currentFileIndex) || '';
            continue;
        }

        // Content boxes - various formats:
        // h for hbox, v for vbox, k for kern, x for ref, g for glue
        // Format: type:line:column:page:x:y:W:H:D (width, height, depth)
        const boxMatch = line.match(/^([hvkxg]):(\d+):(\d+):(-?\d+):(-?\d+):(-?\d+):(-?\d+)?:?(-?\d+)?/);
        if (boxMatch && currentFile) {
            entries.push({
                file: currentFile,
                line: parseInt(boxMatch[2]),
                column: parseInt(boxMatch[3]),
                page: currentPage,
                x: parseInt(boxMatch[4]),
                y: parseInt(boxMatch[5]),
                width: parseInt(boxMatch[6]) || 0,
                height: parseInt(boxMatch[7]) || 0,
            });
            continue;
        }

        // Alternative format: just a reference line
        // Sometimes synctex uses different formats
        const altMatch = line.match(/^([hvkxg])(\d+),(\d+):(\d+),(\d+)(?::(\d+),(\d+),(\d+))?/);
        if (altMatch && currentFile) {
            entries.push({
                file: currentFile,
                line: parseInt(altMatch[2]),
                column: parseInt(altMatch[3]),
                page: currentPage,
                x: parseInt(altMatch[4]),
                y: parseInt(altMatch[5]),
                width: parseInt(altMatch[6]) || 0,
                height: parseInt(altMatch[7]) || 0,
            });
        }
    }

    return { entries, files, magnification, xOffset, yOffset };
}

/**
 * Convert PDF coordinates (in points) to SyncTeX coordinates (scaled points)
 * PDF coordinate system: origin at bottom-left
 * SyncTeX uses scaled points (65536 sp = 1 pt by default)
 */
function pdfToSyncTeXCoords(
    pdfX: number,
    pdfY: number,
    pageHeight: number,
    magnification: number = 1000
): { x: number; y: number } {
    // Convert from PDF points to scaled points
    // Note: magnification is typically 1000 (meaning 1:1)
    const scale = 65536 * (magnification / 1000);

    return {
        x: Math.round(pdfX * scale),
        // PDF y is from bottom, SyncTeX y is from top
        y: Math.round((pageHeight - pdfY) * scale),
    };
}

/**
 * Find the closest SyncTeX entry to the given coordinates
 */
export function findClosestEntry(
    data: SyncTeXData,
    page: number,
    pdfX: number,
    pdfY: number,
    pageHeight: number = 792 // Default letter height in points
): SyncTeXEntry | null {
    const { x, y } = pdfToSyncTeXCoords(pdfX, pdfY, pageHeight, data.magnification);

    // Filter to entries on the same page
    const pageEntries = data.entries.filter((e) => e.page === page);
    if (pageEntries.length === 0) return null;

    // Find closest by Euclidean distance
    let closest: SyncTeXEntry | null = null;
    let minDist = Infinity;

    for (const entry of pageEntries) {
        const dx = x - entry.x;
        const dy = y - entry.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < minDist) {
            minDist = dist;
            closest = entry;
        }
    }

    return closest;
}

/**
 * Main function: Parse synctex data and find source location
 */
export async function findSourceLocation(
    synctexBase64: string,
    page: number,
    pdfX: number,
    pdfY: number,
    pageHeight: number = 792
): Promise<{ file: string; line: number; column: number } | null> {
    try {
        const content = await decompressGzip(synctexBase64);
        if (!content) return null;

        const data = parseSyncTeXContent(content);
        const entry = findClosestEntry(data, page, pdfX, pdfY, pageHeight);

        if (!entry) return null;

        // Return just the basename of the file
        const filename = entry.file.split('/').pop() || entry.file;

        return {
            file: filename,
            line: entry.line,
            column: entry.column,
        };
    } catch (error) {
        console.error('SyncTeX lookup failed:', error);
        return null;
    }
}

export default {
    findSourceLocation,
    findClosestEntry,
    parseSyncTeXContent: async (base64: string) => {
        const content = await decompressGzip(base64);
        return parseSyncTeXContent(content);
    },
};
