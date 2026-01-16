import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { gunzipSync } from "zlib";

/**
 * SyncTeX API - Maps PDF positions to source file locations
 * 
 * POST /api/synctex
 * Body: { page: number, x: number, y: number, synctexData: string }
 * Returns: { file: string, line: number }
 */

interface SyncTeXEntry {
    file: string;
    line: number;
    column: number;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

// Parse SyncTeX data (simplified parser)
function parseSyncTeX(data: string): SyncTeXEntry[] {
    const entries: SyncTeXEntry[] = [];
    const lines = data.split("\n");

    let currentFile = "";
    let currentPage = 0;
    let inputFiles: Map<number, string> = new Map();

    for (const line of lines) {
        // Input file declaration: Input:n:filename
        if (line.startsWith("Input:")) {
            const match = line.match(/^Input:(\d+):(.+)$/);
            if (match) {
                inputFiles.set(parseInt(match[1]), match[2]);
            }
            continue;
        }

        // Page start: {pagenum
        if (line.startsWith("{")) {
            const match = line.match(/^\{(\d+)$/);
            if (match) {
                currentPage = parseInt(match[1]);
            }
            continue;
        }

        // File reference: (n or f:n - where n is file index
        if (line.match(/^[(\[]?\d+$/)) {
            const fileIndex = parseInt(line.replace(/[(\[]/, ""));
            currentFile = inputFiles.get(fileIndex) || "";
            continue;
        }

        // Content box: hbox, vbox, or kern with coordinates
        // Format varies but typically: type:line:column:x:y:w:h
        const boxMatch = line.match(/^([hvkx]):(\d+):(\d+):(-?\d+):(-?\d+):(\d+):(\d+)/);
        if (boxMatch && currentFile) {
            entries.push({
                file: currentFile,
                line: parseInt(boxMatch[2]),
                column: parseInt(boxMatch[3]),
                page: currentPage,
                x: parseInt(boxMatch[4]),
                y: parseInt(boxMatch[5]),
                width: parseInt(boxMatch[6]),
                height: parseInt(boxMatch[7]),
            });
        }
    }

    return entries;
}

// Find the closest entry to a given position
function findClosestEntry(
    entries: SyncTeXEntry[],
    page: number,
    x: number,
    y: number
): SyncTeXEntry | null {
    // Filter to entries on the same page
    const pageEntries = entries.filter((e) => e.page === page);
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

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { page, x, y, synctexData } = body;

        if (typeof page !== "number" || typeof x !== "number" || typeof y !== "number") {
            return NextResponse.json(
                { error: "Missing page, x, or y coordinates" },
                { status: 400 }
            );
        }

        if (!synctexData) {
            return NextResponse.json(
                { error: "Missing synctexData" },
                { status: 400 }
            );
        }

        // Parse the synctex data
        let syncTexContent = synctexData;

        // If it's base64-encoded gzipped data, decode and decompress
        if (synctexData.startsWith("H4sI") || synctexData.includes("base64,")) {
            try {
                const base64Data = synctexData.replace(/^data:[^,]+,/, "");
                const buffer = Buffer.from(base64Data, "base64");
                syncTexContent = gunzipSync(buffer).toString("utf-8");
            } catch {
                // Try as plain text
                syncTexContent = synctexData;
            }
        }

        const entries = parseSyncTeX(syncTexContent);
        const closest = findClosestEntry(entries, page, x, y);

        if (!closest) {
            return NextResponse.json(
                { error: "No matching source location found" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            file: path.basename(closest.file),
            line: closest.line,
            column: closest.column,
        });
    } catch (error) {
        console.error("SyncTeX error:", error);
        return NextResponse.json(
            { error: "Failed to parse SyncTeX data" },
            { status: 500 }
        );
    }
}
