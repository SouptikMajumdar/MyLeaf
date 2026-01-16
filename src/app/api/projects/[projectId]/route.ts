import { NextRequest, NextResponse } from "next/server";
import { isDatabaseAvailable } from "@/lib/db";
import { getUser } from "@/lib/auth/middleware";
import {
  getProject,
  updateProject,
  deleteProject,
} from "@/lib/services/project";

// GET /api/projects/[projectId] - Get project details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    if (!isDatabaseAvailable()) {
      return NextResponse.json(
        { error: "Projects unavailable in demo mode. Database not configured." },
        { status: 503 }
      );
    }

    const user = await getUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;
    const project = await getProject(projectId, user.id);

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Get project error:", error);
    return NextResponse.json(
      { error: "Failed to get project" },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[projectId] - Update project
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    if (!isDatabaseAvailable()) {
      return NextResponse.json(
        { error: "Projects unavailable in demo mode. Database not configured." },
        { status: 503 }
      );
    }

    const user = await getUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { name, description } = body;

    const project = await updateProject(projectId, user.id, {
      name: name?.trim(),
      description,
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found or not authorized" },
        { status: 404 }
      );
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Update project error:", error);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[projectId] - Delete project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    if (!isDatabaseAvailable()) {
      return NextResponse.json(
        { error: "Projects unavailable in demo mode. Database not configured." },
        { status: 503 }
      );
    }

    const user = await getUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;
    const deleted = await deleteProject(projectId, user.id);

    if (!deleted) {
      return NextResponse.json(
        { error: "Project not found or not authorized" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete project error:", error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
}
