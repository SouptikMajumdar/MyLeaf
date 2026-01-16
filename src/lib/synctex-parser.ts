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
 * Tectonic format examples:
 * - (1,121:4810670,39540112:0,786432,0  -> (fileIndex,line:x,y:w,h,d
 * - g1,121:4810670,39540112             -> gFileIndex,line:x,y
 * - x1,121:5685182,39540112             -> xFileIndex,line:x,y
 * - [1,121:4810670,39540112:...         -> [fileIndex,line:x,y:...
 */
function parseSyncTeXContent(content: string): SyncTeXData {
    const entries: SyncTeXEntry[] = [];
    const files = new Map<number, string>();
    const lines = content.split('\n');

    let magnification = 1000;
    let xOffset = 0;
    let yOffset = 0;
    let currentPage = 0;

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

        // Page boundary: {n
        if (line.startsWith('{')) {
            const match = line.match(/^\{(\d+)/);
            if (match) {
                currentPage = parseInt(match[1]);
            }
            continue;
        }

        // Tectonic synctex format: (fileIndex,line:x,y:w,h,d or [fileIndex,line:x,y:...
        // Pattern: opening bracket/paren + fileIndex,line:x,y:optional_rest
        const boxMatch = line.match(/^[([](\d+),(\d+):(-?\d+),(-?\d+)(?::(-?\d+),(-?\d+),(-?\d+))?/);
        if (boxMatch) {
            const fileIndex = parseInt(boxMatch[1]);
            const filename = files.get(fileIndex) || '';
            if (filename) {
                entries.push({
                    file: filename,
                    line: parseInt(boxMatch[2]),
                    column: 0,
                    page: currentPage,
                    x: parseInt(boxMatch[3]),
                    y: parseInt(boxMatch[4]),
                    width: parseInt(boxMatch[5]) || 0,
                    height: parseInt(boxMatch[6]) || 0,
                });
            }
            continue;
        }

        // Glue/kern/etc: gFileIndex,line:x,y or xFileIndex,line:x,y or hFileIndex,line:x,y
        const glueMatch = line.match(/^([gxhvk])(\d+),(\d+):(-?\d+),(-?\d+)/);
        if (glueMatch) {
            const fileIndex = parseInt(glueMatch[2]);
            const filename = files.get(fileIndex) || '';
            if (filename) {
                entries.push({
                    file: filename,
                    line: parseInt(glueMatch[3]),
                    column: 0,
                    page: currentPage,
                    x: parseInt(glueMatch[4]),
                    y: parseInt(glueMatch[5]),
                    width: 0,
                    height: 0,
                });
            }
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
