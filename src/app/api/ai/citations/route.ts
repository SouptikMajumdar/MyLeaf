export const runtime = "nodejs";

import { ask } from "@/lib/ai/provider";
import { PROMPTS } from "@/lib/ai/prompts";

const MAX_QUERY_LENGTH = 500;
const SEMANTIC_SCHOLAR_API = "https://api.semanticscholar.org/graph/v1";

interface CitationRequest {
  query: string;
}

interface SemanticScholarPaper {
  paperId: string;
  title: string;
  abstract?: string;
  year?: number;
  citationCount?: number;
  authors?: Array<{ name: string }>;
  externalIds?: {
    DOI?: string;
    ArXiv?: string;
  };
  url?: string;
}

interface CitationResult {
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

function isValidRequest(body: unknown): body is CitationRequest {
  return (
    typeof body === "object" &&
    body !== null &&
    "query" in body &&
    typeof (body as CitationRequest).query === "string"
  );
}

/**
 * Generate BibTeX entry from paper metadata
 */
function generateBibtex(paper: CitationResult, index: number): string {
  const authorLastNames = paper.authors.map((a) => {
    const parts = a.trim().split(" ");
    return parts[parts.length - 1].toLowerCase();
  });
  const key = `${authorLastNames[0] ?? "unknown"}${paper.year ?? "nd"}${index}`;
  
  const authors = paper.authors.join(" and ");
  const lines = [
    `@article{${key},`,
    `  title = {${paper.title}},`,
    `  author = {${authors}},`,
  ];
  
  if (paper.year) {
    lines.push(`  year = {${paper.year}},`);
  }
  if (paper.doi) {
    lines.push(`  doi = {${paper.doi}},`);
  }
  if (paper.arxivId) {
    lines.push(`  eprint = {${paper.arxivId}},`);
    lines.push(`  archiveprefix = {arXiv},`);
  }
  if (paper.url) {
    lines.push(`  url = {${paper.url}},`);
  }
  
  lines.push(`}`);
  return lines.join("\n");
}

/**
 * Search Semantic Scholar for papers
 */
async function searchSemanticScholar(query: string): Promise<SemanticScholarPaper[]> {
  const fields = "paperId,title,abstract,year,citationCount,authors,externalIds,url";
  const url = `${SEMANTIC_SCHOLAR_API}/paper/search?query=${encodeURIComponent(query)}&limit=10&fields=${fields}`;

  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    console.error(`Semantic Scholar API error: ${response.status}`);
    return [];
  }

  const data = await response.json();
  return data.data ?? [];
}

/**
 * Generate search queries from user's claim using LLM
 */
async function generateSearchQueries(claim: string): Promise<string[]> {
  try {
    const response = await ask(PROMPTS.citationQueryGenerator, claim, {
      maxTokens: 256,
      temperature: 0.7,
    });

    // Parse JSON array from response
    const cleaned = response.replace(/```json\n?|\n?```/g, "").trim();
    const queries = JSON.parse(cleaned);
    
    if (Array.isArray(queries) && queries.every((q) => typeof q === "string")) {
      return queries.slice(0, 5);
    }
    
    // Fallback: use the claim directly
    return [claim];
  } catch (error) {
    console.error("Failed to generate search queries:", error);
    // Fallback: use the claim directly
    return [claim];
  }
}

/**
 * Rank papers for relevance using LLM
 */
async function rankPapers(
  claim: string,
  papers: CitationResult[]
): Promise<CitationResult[]> {
  if (papers.length === 0) return [];
  
  try {
    const papersContext = papers
      .map((p, i) => `[${i}] "${p.title}" (${p.year ?? "n.d."}) - ${p.abstract.slice(0, 200)}...`)
      .join("\n\n");

    const prompt = `User's claim: "${claim}"\n\nPapers:\n${papersContext}`;
    
    const response = await ask(PROMPTS.citationRanker, prompt, {
      maxTokens: 512,
      temperature: 0.3,
    });

    // Parse JSON response
    const cleaned = response.replace(/```json\n?|\n?```/g, "").trim();
    const rankings = JSON.parse(cleaned);

    if (!Array.isArray(rankings)) {
      return papers.slice(0, 5);
    }

    // Apply relevance explanations and reorder
    const rankedPapers: CitationResult[] = [];
    for (const rank of rankings.slice(0, 5)) {
      const idx = typeof rank.index === "number" ? rank.index : parseInt(rank.index, 10);
      if (idx >= 0 && idx < papers.length) {
        const paper = { ...papers[idx] };
        paper.relevance = rank.relevance ?? "";
        rankedPapers.push(paper);
      }
    }

    return rankedPapers.length > 0 ? rankedPapers : papers.slice(0, 5);
  } catch (error) {
    console.error("Failed to rank papers:", error);
    return papers.slice(0, 5);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!isValidRequest(body)) {
      return Response.json(
        { error: "Invalid request. Expected: { query: string }" },
        { status: 400 }
      );
    }

    const { query } = body;

    if (query.length === 0) {
      return Response.json(
        { error: "Query cannot be empty" },
        { status: 400 }
      );
    }

    if (query.length > MAX_QUERY_LENGTH) {
      return Response.json(
        { error: `Query too long. Maximum ${MAX_QUERY_LENGTH} characters.` },
        { status: 400 }
      );
    }

    // Step 1: Generate search queries from the claim
    const searchQueries = await generateSearchQueries(query);

    // Step 2: Search Semantic Scholar with each query
    const allPapers: SemanticScholarPaper[] = [];
    const seenIds = new Set<string>();

    for (const sq of searchQueries) {
      const results = await searchSemanticScholar(sq);
      for (const paper of results) {
        if (!seenIds.has(paper.paperId)) {
          seenIds.add(paper.paperId);
          allPapers.push(paper);
        }
      }
      // Small delay to be respectful to the API
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (allPapers.length === 0) {
      return Response.json({ citations: [], message: "No papers found" });
    }

    // Step 3: Convert to our format
    const citations: CitationResult[] = allPapers.map((paper, index) => {
      const result: CitationResult = {
        title: paper.title ?? "Untitled",
        authors: paper.authors?.map((a) => a.name) ?? ["Unknown Author"],
        year: paper.year ?? null,
        abstract: paper.abstract ?? "",
        citationCount: paper.citationCount ?? 0,
        doi: paper.externalIds?.DOI ?? null,
        arxivId: paper.externalIds?.ArXiv ?? null,
        url: paper.url ?? "",
        bibtex: "", // Will be generated below
      };
      result.bibtex = generateBibtex(result, index);
      return result;
    });

    // Step 4: Rank papers using LLM (if AI provider is configured)
    let rankedCitations: CitationResult[];
    try {
      rankedCitations = await rankPapers(query, citations);
    } catch {
      // If ranking fails (e.g., no API key), just return top 5 by citation count
      rankedCitations = citations
        .sort((a, b) => b.citationCount - a.citationCount)
        .slice(0, 5);
    }

    return Response.json({ citations: rankedCitations });
  } catch (error) {
    console.error("Citation finder error:", error);

    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
