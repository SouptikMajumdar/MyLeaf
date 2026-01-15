export const runtime = "nodejs";

import {
  CONFERENCES,
  getConferenceById,
  generateFallbackTemplate,
} from "@/lib/templates/conferences";
import {
  discoverTemplate,
  getConferenceSources,
} from "@/lib/templates/scraper";

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

// Cache discovered templates in memory (per server instance)
const templateCache = new Map<
  string,
  { data: TemplateResponse; timestamp: number }
>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

/**
 * GET /api/templates - List all available conferences
 */
export async function GET() {
  const conferences = CONFERENCES.map((c) => ({
    id: c.id,
    name: c.name,
    shortName: c.shortName,
    category: c.category,
    description: c.description,
    website: c.website,
  }));

  return Response.json({ templates: conferences });
}

/**
 * POST /api/templates - Fetch a specific conference template
 * 
 * Uses a smart scraper that:
 * 1. Tries GitHub repos (most reliable)
 * 2. Scrapes official guideline pages for download links
 * 3. Falls back to a generic template
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, year } = body as { id?: string; year?: number };

    if (!id || typeof id !== "string") {
      return Response.json({ error: "Missing conference id" }, { status: 400 });
    }

    const conference = getConferenceById(id);
    if (!conference) {
      return Response.json(
        { error: `Conference "${id}" not found` },
        { status: 404 },
      );
    }

    // Check cache first
    const cacheKey = `${id}-${year ?? "latest"}`;
    const cached = templateCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return Response.json(cached.data);
    }

    // Try to discover the template dynamically
    const sources = getConferenceSources(id);
    let templateData: TemplateResponse;

    if (sources) {
      const discovered = await discoverTemplate(id, year);

      if (discovered) {
        const files: TemplateFile[] = [
          { filename: "main.tex", content: discovered.mainTex },
          ...discovered.styleFiles,
        ];

        templateData = {
          id: conference.id,
          name: conference.name,
          files,
          sourceUrl: discovered.sourceUrl,
          isFallback: false,
        };
      } else {
        // Scraping failed, use fallback
        templateData = {
          id: conference.id,
          name: conference.name,
          files: [
            {
              filename: "main.tex",
              content: generateFallbackTemplate(
                conference.name,
                conference.shortName,
              ),
            },
          ],
          isFallback: true,
        };
      }
    } else {
      // No scraper sources defined, use fallback
      templateData = {
        id: conference.id,
        name: conference.name,
        files: [
          {
            filename: "main.tex",
            content: generateFallbackTemplate(
              conference.name,
              conference.shortName,
            ),
          },
        ],
        isFallback: true,
      };
    }

    // Cache the result
    templateCache.set(cacheKey, { data: templateData, timestamp: Date.now() });

    return Response.json(templateData);
  } catch (error) {
    console.error("Template fetch error:", error);
    return Response.json(
      { error: "Failed to fetch template" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/templates - Clear template cache (for debugging)
 */
export async function DELETE() {
  templateCache.clear();
  return Response.json({ message: "Template cache cleared" });
}
