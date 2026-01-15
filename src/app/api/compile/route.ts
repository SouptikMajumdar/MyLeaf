export const runtime = "nodejs";

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX_TEX_BYTES = Number(process.env.MYLEAF_MAX_TEX_BYTES ?? 200_000);
const MAX_PDF_BYTES = Number(process.env.MYLEAF_MAX_PDF_BYTES ?? 10_000_000);
const COMPILE_TIMEOUT_MS = Number(
  process.env.MYLEAF_COMPILE_TIMEOUT_MS ?? 20_000,
);

// Common paths where tectonic might be installed
const TECTONIC_PATHS = [
  process.env.MYLEAF_TECTONIC_PATH, // Allow explicit override
  "/opt/homebrew/bin/tectonic", // macOS ARM (Homebrew)
  "/usr/local/bin/tectonic", // macOS Intel (Homebrew) / Linux
  "/usr/bin/tectonic", // Linux system install
  "/home/linuxbrew/.linuxbrew/bin/tectonic", // Linux Homebrew
].filter(Boolean) as string[];

let cachedTectonicPath: string | null = null;

function findTectonic(): string | null {
  if (cachedTectonicPath !== null) return cachedTectonicPath;

  // First, check known paths
  for (const p of TECTONIC_PATHS) {
    if (existsSync(p)) {
      cachedTectonicPath = p;
      return p;
    }
  }

  // Fall back to `which` command (will work if PATH is set correctly)
  try {
    const result = spawnSync("which", ["tectonic"], {
      encoding: "utf8",
      timeout: 2000,
    });
    if (result.status === 0 && result.stdout) {
      const p = result.stdout.trim();
      if (p && existsSync(p)) {
        cachedTectonicPath = p;
        return p;
      }
    }
  } catch {
    // Ignore errors from which command
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

interface ProjectFile {
  filename: string;
  content: string;
}

interface CompileRequest {
  tex?: string; // Legacy: single file mode
  files?: ProjectFile[]; // New: multi-file mode
  mainFile?: string; // Which file to compile (defaults to "main.tex")
}

async function readRequestFiles(request: Request): Promise<{
  files: ProjectFile[];
  mainFile: string;
}> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as unknown;
    if (!isRecord(body)) {
      throw new Response(
        JSON.stringify({ error: "Expected JSON body" }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        },
      );
    }

    // New multi-file format
    if (Array.isArray(body.files)) {
      const files = body.files as ProjectFile[];
      const mainFile = typeof body.mainFile === "string" ? body.mainFile : "main.tex";
      return { files, mainFile };
    }

    // Legacy single-file format
    if (typeof body.tex === "string") {
      return {
        files: [{ filename: "main.tex", content: body.tex }],
        mainFile: "main.tex",
      };
    }

    throw new Response(
      JSON.stringify({ error: "Expected JSON body: { files: [...] } or { tex: string }" }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      },
    );
  }

  if (contentType.includes("text/plain") || contentType === "") {
    const tex = await request.text();
    return {
      files: [{ filename: "main.tex", content: tex }],
      mainFile: "main.tex",
    };
  }

  throw new Response(
    JSON.stringify({ error: `Unsupported content-type: ${contentType}` }),
    {
      status: 415,
      headers: { "content-type": "application/json" },
    },
  );
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "myleaf-compile-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function runTectonic(args: string[], cwd: string): Promise<{ stderr: string }> {
  const tectonicPath = findTectonic();
  if (!tectonicPath) {
    return Promise.reject(
      Object.assign(new Error("tectonic not found"), { code: "ENOENT" }),
    );
  }

  return new Promise((resolve, reject) => {
    const child = spawn(tectonicPath, args, {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });

    let stderr = "";
    const maxStderrBytes = 64 * 1024;

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length >= maxStderrBytes) return;
      const remaining = maxStderrBytes - stderr.length;
      stderr += chunk.toString("utf8", 0, remaining);
    });

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
    }, COMPILE_TIMEOUT_MS);

    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (signal === "SIGKILL") {
        reject(new Error("Compile timed out"));
        return;
      }
      if (code !== 0) {
        reject(new Error(stderr || `tectonic exited with code ${code}`));
        return;
      }
      resolve({ stderr });
    });
  });
}

export async function POST(request: Request) {
  try {
    const { files, mainFile } = await readRequestFiles(request);
    
    // Calculate total size of all files
    let totalBytes = 0;
    for (const file of files) {
      totalBytes += Buffer.byteLength(file.content, "utf8");
    }
    
    if (totalBytes > MAX_TEX_BYTES * 10) { // Allow 10x for multi-file projects
      return Response.json(
        {
          error: `Project too large (${totalBytes} bytes). Max is ${MAX_TEX_BYTES * 10} bytes.`,
        },
        { status: 413 },
      );
    }

    const pdfBytes = await withTempDir(async (dir) => {
      const outDir = path.join(dir, "out");
      await fs.mkdir(outDir, { recursive: true });

      // Write all project files to the temp directory
      for (const file of files) {
        // Security: prevent path traversal
        const safeName = path.basename(file.filename);
        const filePath = path.join(dir, safeName);
        await fs.writeFile(filePath, file.content, { encoding: "utf8" });
      }

      // Compile the main file
      const safeMainFile = path.basename(mainFile);
      await runTectonic([safeMainFile, "--outdir", "out"], dir);

      // The output PDF name matches the input file name
      const pdfName = safeMainFile.replace(/\.tex$/, ".pdf");
      const pdfPath = path.join(outDir, pdfName);
      
      const stat = await fs.stat(pdfPath);
      if (stat.size > MAX_PDF_BYTES) {
        throw new Error(
          `Output too large (${stat.size} bytes). Max is ${MAX_PDF_BYTES} bytes.`,
        );
      }

      return await fs.readFile(pdfPath);
    });

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;

    const message = err instanceof Error ? err.message : "Unknown error";

    // Handle the common dev/deploy case where the LaTeX engine isn't installed yet.
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return Response.json(
        {
          error:
            "LaTeX engine not available (tectonic not found). Install tectonic in the Docker image/host.",
        },
        { status: 503 },
      );
    }

    const status = message.includes("too large")
      ? 413
      : message.includes("timed out")
        ? 504
        : 400;

    return Response.json({ error: message }, { status });
  }
}
