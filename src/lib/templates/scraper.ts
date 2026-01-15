/**
 * Conference Template Scraper
 * 
 * Discovers and fetches LaTeX templates from official conference websites.
 * More robust than hardcoded URLs since it adapts to URL changes.
 */

import JSZip from "jszip";

export interface ScrapedTemplate {
  mainTex: string;
  styleFiles: { filename: string; content: string }[];
  sourceUrl: string;
}

// Helper: extract 4-digit years from URLs and sort descending
function extractYearsFromUrls(urls: string[]): number[] {
  const years = new Set<number>();
  for (const url of urls) {
    const matches = url.match(/20\d{2}/g); // conferences we target are 20xx
    if (matches) {
      for (const m of matches) {
        const n = Number(m);
        if (n >= 2000 && n < 2100) years.add(n);
      }
    }
  }
  return [...years].sort((a, b) => b - a);
}

// Build a priority list of years to try (latest first)
function buildYearPriority(source: ConferenceSource, requestedYear?: number): number[] {
  const currentYear = new Date().getFullYear();
  const years = new Set<number>();

  if (requestedYear && requestedYear >= 2000 && requestedYear < 2100) {
    years.add(requestedYear);
  }

  for (const y of extractYearsFromUrls([...source.knownZipUrls, ...source.guidelinePages])) {
    years.add(y);
  }

  // Ensure we always try at least currentYear then the previous year
  years.add(currentYear);
  years.add(currentYear - 1);

  return [...years].sort((a, b) => b - a);
}

interface ConferenceSource {
  /** Conference identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Official author guidelines / template page URLs to scrape */
  guidelinePages: string[];
  /** Known GitHub repos (owner/repo format) */
  githubRepos: string[];
  /** Known ZIP download URLs (direct links) */
  knownZipUrls: string[];
  /** Known Overleaf template IDs */
  overleafIds: string[];
  /** File patterns to look for (regex) */
  filePatterns: RegExp[];
  /** Keywords that indicate template download links */
  linkKeywords: string[];
}

/**
 * Conference sources with multiple fallback locations
 */
export const CONFERENCE_SOURCES: ConferenceSource[] = [
  {
    id: "neurips",
    name: "NeurIPS",
    guidelinePages: [
      "https://neurips.cc/Conferences/2025/CallForPapers",
      "https://neurips.cc/Conferences/2025/AuthorGuidelines",
      "https://neurips.cc/Conferences/2026/CallForPapers",
    ],
    githubRepos: ["NeurIPS/NeurIPS-LaTeX-Template"],
    knownZipUrls: [
      "https://media.neurips.cc/Conferences/NeurIPS2026/Styles.zip",
      "https://media.neurips.cc/Conferences/NeurIPS2025/Styles.zip",
    ],
    overleafIds: ["neurips_2025", "neurips_2024"],
    filePatterns: [/neurips_\d{4}\.tex/i, /neurips.*\.sty/i],
    linkKeywords: ["latex", "template", "style", "download", ".zip", ".tar"],
  },
  {
    id: "icml",
    name: "ICML",
    guidelinePages: [
      "https://icml.cc/Conferences/2025/CallForPapers",
      "https://icml.cc/Conferences/2025/StyleAuthorInstructions",
      "https://icml.cc/Conferences/2026/CallForPapers",
    ],
    githubRepos: ["ICML/ICML-LaTeX-Template"],
    knownZipUrls: [
      "https://icml.cc/Conferences/2026/Styles/icml2026.zip",
      "https://icml.cc/Conferences/2025/Styles/icml2025.zip",
    ],
    overleafIds: ["icml2025", "icml2024"],
    filePatterns: [/icml\d{4}.*\.tex/i, /icml\d{4}\.sty/i],
    linkKeywords: ["latex", "template", "style", "download", ".zip"],
  },
  {
    id: "iclr",
    name: "ICLR",
    guidelinePages: [
      "https://iclr.cc/Conferences/2025/CallForPapers",
      "https://iclr.cc/Conferences/2026/CallForPapers",
    ],
    githubRepos: ["ICLR/Master-Template"],
    knownZipUrls: [],
    overleafIds: ["iclr2025_conference", "iclr2024_conference"],
    filePatterns: [/iclr\d{4}.*\.tex/i, /iclr\d{4}.*\.sty/i],
    linkKeywords: ["latex", "template", "style", "overleaf"],
  },
  {
    id: "cvpr",
    name: "CVPR",
    guidelinePages: [
      "https://cvpr.thecvf.com/Conferences/2025/AuthorGuidelines",
      "https://cvpr2025.thecvf.com/submission-guidelines",
    ],
    githubRepos: ["MCG-NKU/CVPR_Template", "cvpr-org/author-kit"],
    knownZipUrls: [],
    overleafIds: ["cvpr2025", "cvpr2024"],
    filePatterns: [/cvpr\.tex/i, /cvpr\.sty/i, /cvpr_ek_template\.tex/i],
    linkKeywords: ["latex", "template", "author kit", "download"],
  },
  {
    id: "acl",
    name: "ACL",
    guidelinePages: [
      "https://2025.aclweb.org/calls/main_conference_papers/",
      "https://acl-org.github.io/ACLPUB/formatting.html",
    ],
    githubRepos: ["acl-org/acl-style-files"],
    knownZipUrls: [],
    overleafIds: ["acl2025", "acl2024"],
    filePatterns: [/acl.*\.tex/i, /acl\.sty/i, /acl_natbib\.bst/i],
    linkKeywords: ["latex", "template", "style files", "download"],
  },
  {
    id: "emnlp",
    name: "EMNLP",
    guidelinePages: [
      "https://2025.emnlp.org/calls/main_conference_papers/",
    ],
    githubRepos: ["acl-org/acl-style-files"],
    knownZipUrls: [],
    overleafIds: ["emnlp2025", "emnlp2024"],
    filePatterns: [/emnlp.*\.tex/i, /acl\.sty/i],
    linkKeywords: ["latex", "template", "style"],
  },
  {
    id: "aaai",
    name: "AAAI",
    guidelinePages: [
      "https://aaai.org/conference/aaai/aaai-25/submission-instructions/",
      "https://aaai.org/authorkit/",
    ],
    githubRepos: ["AAAI/aaai-template"],
    knownZipUrls: [
      "https://aaai.org/wp-content/uploads/2025/01/aaai26-author-kit.zip",
      "https://aaai.org/wp-content/uploads/2024/01/aaai25-author-kit.zip",
    ],
    overleafIds: ["aaai2025", "aaai2024"],
    filePatterns: [/aaai\d{2}\.tex/i, /aaai\d{2}\.sty/i],
    linkKeywords: ["latex", "author kit", "template", "download"],
  },
  {
    id: "ieee",
    name: "IEEE Conference",
    guidelinePages: [
      "https://www.ieee.org/conferences/publishing/templates.html",
    ],
    githubRepos: ["latextemplates/IEEE"],
    knownZipUrls: [],
    overleafIds: ["ieee_conference"],
    filePatterns: [/IEEEtran\.cls/i, /.*ieee.*\.tex/i],
    linkKeywords: ["latex", "template", "IEEEtran", "download"],
  },
  {
    id: "acm",
    name: "ACM SIGCONF",
    guidelinePages: [
      "https://www.acm.org/publications/proceedings-template",
    ],
    githubRepos: ["acmart/acmart"],
    knownZipUrls: [
      "https://portalparts.acm.org/hippo/latex_templates/acmart-primary.zip",
    ],
    overleafIds: ["acm-sigconf", "acmart"],
    filePatterns: [/acmart\.cls/i, /sample-sigconf\.tex/i],
    linkKeywords: ["latex", "acmart", "template", "download"],
  },
];

/**
 * Try to fetch template files from a GitHub repository
 */
export async function fetchFromGitHub(
  repo: string,
  year?: number
): Promise<ScrapedTemplate | null> {
  const currentYear = year ?? new Date().getFullYear();
  const headers = {
    "User-Agent": "MyLeaf-TemplateScraper/1.0",
    Accept: "application/vnd.github.v3+json",
  };

  try {
    // First, get the repo contents
    const apiUrl = `https://api.github.com/repos/${repo}/contents`;
    const response = await fetch(apiUrl, { headers });

    if (!response.ok) {
      console.warn(`GitHub API error for ${repo}: ${response.status}`);
      return null;
    }

    const contents = (await response.json()) as Array<{
      name: string;
      type: string;
      download_url: string | null;
      path: string;
    }>;

    // Look for year-specific directories first
    const yearDirs = contents.filter(
      (f) =>
        f.type === "dir" &&
        (f.name.includes(String(currentYear)) ||
          f.name.includes(String(currentYear - 1))),
    );

    let targetDir = "";
    if (yearDirs.length > 0) {
      // Prefer current year, fall back to previous
      const currentYearDir = yearDirs.find((d) =>
        d.name.includes(String(currentYear)),
      );
      targetDir = currentYearDir?.path ?? yearDirs[0].path;
    }

    // Get files from target directory or root
    const filesUrl = targetDir
      ? `https://api.github.com/repos/${repo}/contents/${targetDir}`
      : apiUrl;

    const filesResponse = await fetch(filesUrl, { headers });
    if (!filesResponse.ok) return null;

    const files = (await filesResponse.json()) as Array<{
      name: string;
      type: string;
      download_url: string | null;
    }>;

    // Helper to check if a file has a relevant extension
    const isRelevantFile = (name: string) => {
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      return TEMPLATE_EXTENSIONS.has(ext);
    };

    // Find all relevant LaTeX files
    const texFiles = files.filter(
      (f) => f.type === "file" && f.name.endsWith(".tex"),
    );
    const supportFiles = files.filter(
      (f) =>
        f.type === "file" &&
        isRelevantFile(f.name) &&
        !f.name.endsWith(".tex"),
    );

    if (texFiles.length === 0) return null;

    // Find the main template (prefer example/sample files)
    const mainTexFile =
      texFiles.find(
        (f) =>
          f.name.includes("example") ||
          f.name.includes("sample") ||
          f.name.includes("template"),
      ) ?? texFiles[0];

    if (!mainTexFile.download_url) return null;

    // Fetch main tex content
    const mainTexResponse = await fetch(mainTexFile.download_url, {
      headers: { "User-Agent": "MyLeaf-TemplateScraper/1.0" },
    });
    if (!mainTexResponse.ok) return null;

    const mainTex = await mainTexResponse.text();

    // Fetch ALL other .tex files as dependencies (e.g., math_commands.tex)
    const otherTexFiles = texFiles.filter((f) => f.name !== mainTexFile.name);
    const fetchedStyles: { filename: string; content: string }[] = [];
    
    for (const tf of otherTexFiles.slice(0, 10)) {
      if (!tf.download_url) continue;
      try {
        const texResponse = await fetch(tf.download_url, {
          headers: { "User-Agent": "MyLeaf-TemplateScraper/1.0" },
        });
        if (texResponse.ok) {
          fetchedStyles.push({
            filename: tf.name,
            content: await texResponse.text(),
          });
        }
      } catch {
        // Skip failed files
      }
    }

    // Fetch style/support files (.sty, .cls, .bst, etc.)
    for (const sf of supportFiles.slice(0, 10)) {
      if (!sf.download_url) continue;
      try {
        const styleResponse = await fetch(sf.download_url, {
          headers: { "User-Agent": "MyLeaf-TemplateScraper/1.0" },
        });
        if (styleResponse.ok) {
          fetchedStyles.push({
            filename: sf.name,
            content: await styleResponse.text(),
          });
        }
      } catch {
        // Skip failed style files
      }
    }

    return {
      mainTex,
      styleFiles: fetchedStyles,
      sourceUrl: `https://github.com/${repo}`,
    };
  } catch (error) {
    console.warn(`Error fetching from GitHub ${repo}:`, error);
    return null;
  }
}

/**
 * Scrape a webpage to find template download links
 */
export async function scrapeGuidelinePage(
  url: string,
  keywords: string[],
): Promise<string[]> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html",
      },
    });

    if (!response.ok) return [];

    const html = await response.text();

    // Find all links in the page
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
    const links: string[] = [];
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      const text = match[2].toLowerCase();

      // Check if link text or href contains our keywords
      const isRelevant = keywords.some(
        (kw) =>
          text.includes(kw.toLowerCase()) ||
          href.toLowerCase().includes(kw.toLowerCase()),
      );

      if (isRelevant) {
        // Resolve relative URLs
        let fullUrl = href;
        if (href.startsWith("/")) {
          const urlObj = new URL(url);
          fullUrl = `${urlObj.origin}${href}`;
        } else if (!href.startsWith("http")) {
          const urlObj = new URL(url);
          fullUrl = `${urlObj.origin}/${href}`;
        }
        links.push(fullUrl);
      }
    }

    return links;
  } catch (error) {
    console.warn(`Error scraping ${url}:`, error);
    return [];
  }
}

// File extensions to extract from templates (all LaTeX-related files)
const TEMPLATE_EXTENSIONS = new Set([
  'tex', 'sty', 'cls', 'bst', 'bib', 'bbx', 'cbx', 'def', 'cfg', 'clo', 'fd', 'ldf'
]);

/**
 * Try to find and download a ZIP file containing templates
 */
export async function fetchZipTemplate(
  zipUrl: string,
): Promise<ScrapedTemplate | null> {
  try {
    console.log(`Fetching ZIP template from ${zipUrl}`);
    
    const response = await fetch(zipUrl, {
      headers: {
        "User-Agent": "MyLeaf-TemplateScraper/1.0",
        Accept: "application/zip, application/octet-stream",
      },
    });

    if (!response.ok) {
      console.warn(`Failed to fetch ZIP from ${zipUrl}: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Find all relevant files in the ZIP
    const allFiles: { path: string; filename: string; content: string; ext: string }[] = [];

    // Process all files in the ZIP
    const filePromises: Promise<void>[] = [];
    
    zip.forEach((relativePath, file) => {
      // Skip directories and hidden files
      if (file.dir || relativePath.startsWith("__MACOSX") || relativePath.startsWith(".")) {
        return;
      }

      const filename = relativePath.split("/").pop() ?? relativePath;
      // Skip hidden files at any level
      if (filename.startsWith(".")) return;
      
      const ext = filename.split(".").pop()?.toLowerCase() ?? "";

      // Process text-based LaTeX files
      if (TEMPLATE_EXTENSIONS.has(ext)) {
        const promise = file.async("string").then((content) => {
          allFiles.push({ path: relativePath, filename, content, ext });
        });
        filePromises.push(promise);
      }
    });

    await Promise.all(filePromises);

    // Separate .tex files from other style/support files
    const texFiles = allFiles.filter((f) => f.ext === "tex");
    const otherFiles = allFiles.filter((f) => f.ext !== "tex");

    if (texFiles.length === 0) {
      console.warn(`No .tex files found in ZIP from ${zipUrl}`);
      return null;
    }

    // Find the main template file (the one to compile)
    const mainTexFile =
      // Prefer files named example/sample/template
      texFiles.find(
        (f) =>
          f.filename.toLowerCase().includes("example") ||
          f.filename.toLowerCase().includes("sample") ||
          f.filename.toLowerCase().includes("template"),
      ) ??
      // Or a file that looks like the main document (has documentclass AND begin{document})
      texFiles.find(
        (f) =>
          f.content.includes("\\documentclass") &&
          f.content.includes("\\begin{document}"),
      ) ??
      // Fallback to first .tex file
      texFiles[0];

    // ALL other .tex files become dependencies (like math_commands.tex)
    const dependencyTexFiles = texFiles
      .filter((f) => f.path !== mainTexFile.path)
      .map((f) => ({ filename: f.filename, content: f.content }));

    // Combine: other .tex files + style files (.sty, .cls, .bst, etc.)
    const styleFiles = [
      ...dependencyTexFiles,
      ...otherFiles.map((f) => ({ filename: f.filename, content: f.content })),
    ];

    console.log(`Extracted template from ZIP: ${mainTexFile.path}`);
    console.log(`  - Dependency .tex files: ${dependencyTexFiles.map(f => f.filename).join(", ") || "(none)"}`);
    console.log(`  - Style/support files: ${otherFiles.map(f => f.filename).join(", ") || "(none)"}`);

    return {
      mainTex: mainTexFile.content,
      styleFiles,
      sourceUrl: zipUrl,
    };
  } catch (error) {
    console.warn(`Error extracting ZIP from ${zipUrl}:`, error);
    return null;
  }
}

/**
 * Try Overleaf gallery as a source (they have stable template IDs)
 */
export async function fetchFromOverleaf(
  templateId: string,
): Promise<ScrapedTemplate | null> {
  // Overleaf's gallery API isn't public, but we can try known patterns
  const possibleUrls = [
    `https://www.overleaf.com/latex/templates/${templateId}`,
    `https://www.overleaf.com/project/templates/${templateId}`,
  ];

  for (const url of possibleUrls) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        redirect: "follow",
      });

      if (response.ok) {
        // Overleaf pages don't give us direct file access
        // but we can use this to verify the template exists
        console.log(`Overleaf template ${templateId} exists at ${url}`);
      }
    } catch {
      // Continue to next URL
    }
  }

  return null;
}

/**
 * Main function: Try multiple sources to get a conference template
 */
export async function discoverTemplate(
  conferenceId: string,
  year?: number,
): Promise<ScrapedTemplate | null> {
  const source = CONFERENCE_SOURCES.find(
    (s) => s.id === conferenceId.toLowerCase(),
  );

  if (!source) {
    console.warn(`Unknown conference: ${conferenceId}`);
    return null;
  }

  // Build year priorities so we always try the latest available first
  const yearPriority = buildYearPriority(source, year);

  // Strategy 1: Try known ZIP URLs first (official sources, most reliable)
  const zipCandidates = [...source.knownZipUrls].sort((a, b) => {
    const aYear = extractYearsFromUrls([a])[0] ?? -Infinity;
    const bYear = extractYearsFromUrls([b])[0] ?? -Infinity;
    return bYear - aYear; // newest first
  });

  for (const zipUrl of zipCandidates) {
    const result = await fetchZipTemplate(zipUrl);
    if (result) {
      console.log(`Found template for ${conferenceId} from ZIP: ${zipUrl}`);
      return result;
    }
  }

  // Strategy 2: Try GitHub repos
  for (const candidateYear of yearPriority) {
    for (const repo of source.githubRepos) {
      const result = await fetchFromGitHub(repo, candidateYear);
      if (result) {
        console.log(`Found template for ${conferenceId} from GitHub: ${repo} (year ${candidateYear})`);
        return result;
      }
    }
  }

  // Strategy 3: Scrape official guideline pages for download links
  for (const pageUrl of source.guidelinePages) {
    const links = await scrapeGuidelinePage(pageUrl, source.linkKeywords);

    // Look for ZIP files first (they usually have complete packages)
    for (const link of links) {
      if (link.endsWith(".zip") || link.endsWith(".tar.gz")) {
        const zipResult = await fetchZipTemplate(link);
        if (zipResult) {
          console.log(`Found template for ${conferenceId} from scraped ZIP: ${link}`);
          return zipResult;
        }
      }
    }

    // Then try direct .tex file links
    for (const link of links) {
      if (link.endsWith(".tex")) {
        try {
          const response = await fetch(link, {
            headers: { "User-Agent": "MyLeaf-TemplateScraper/1.0" },
          });
          if (response.ok) {
            const mainTex = await response.text();
            return {
              mainTex,
              styleFiles: [],
              sourceUrl: link,
            };
          }
        } catch {
          continue;
        }
      }
    }
  }

  // Strategy 4: Try Overleaf (verification only for now)
  for (const overleafId of source.overleafIds) {
    await fetchFromOverleaf(overleafId);
  }

  return null;
}

/**
 * Get all available sources for a conference (for fallback display)
 */
export function getConferenceSources(conferenceId: string): ConferenceSource | null {
  return CONFERENCE_SOURCES.find((s) => s.id === conferenceId.toLowerCase()) ?? null;
}
