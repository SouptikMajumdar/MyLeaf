import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth/middleware";
import { getFileTree, createFile, initializeProjectFiles } from "@/lib/services/file";

// GET /api/projects/[projectId]/files - Get file tree
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;

    // Initialize project files if needed
    await initializeProjectFiles(projectId);

    const fileTree = await getFileTree(projectId, user.id);

    if (!fileTree) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ fileTree });
  } catch (error) {
    console.error("Get file tree error:", error);
    return NextResponse.json(
      { error: "Failed to get files" },
      { status: 500 }
    );
  }
}

// POST /api/projects/[projectId]/files - Create file or folder
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { name, type, parentId, content } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "File name is required" },
        { status: 400 }
      );
    }

    if (!type || !["file", "folder"].includes(type)) {
      return NextResponse.json(
        { error: "Type must be 'file' or 'folder'" },
        { status: 400 }
      );
    }

    const file = await createFile(
      projectId,
      user.id,
      name.trim(),
      type,
      parentId,
      content
    );

    if (!file) {
      return NextResponse.json(
        { error: "Failed to create file or not authorized" },
        { status: 403 }
      );
    }

    return NextResponse.json({ file }, { status: 201 });
  } catch (error) {
    console.error("Create file error:", error);
    return NextResponse.json(
      { error: "Failed to create file" },
      { status: 500 }
    );
  }
}
