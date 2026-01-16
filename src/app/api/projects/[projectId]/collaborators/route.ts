import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth/middleware";
import {
  getProject,
  getProjectCollaborators,
  addCollaborator,
} from "@/lib/services/project";

// GET /api/projects/[projectId]/collaborators - List collaborators
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

    // Verify user has access to project
    const project = await getProject(projectId, user.id);
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const collaborators = await getProjectCollaborators(projectId);

    return NextResponse.json({
      collaborators,
      owner: project.owner,
    });
  } catch (error) {
    console.error("Get collaborators error:", error);
    return NextResponse.json(
      { error: "Failed to get collaborators" },
      { status: 500 }
    );
  }
}

// POST /api/projects/[projectId]/collaborators - Add collaborator
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
    const { email, role } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    if (role && !["editor", "viewer"].includes(role)) {
      return NextResponse.json(
        { error: "Invalid role" },
        { status: 400 }
      );
    }

    const result = await addCollaborator(
      projectId,
      user.id,
      email,
      role || "editor"
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    // Return updated collaborators list
    const collaborators = await getProjectCollaborators(projectId);

    return NextResponse.json({ collaborators }, { status: 201 });
  } catch (error) {
    console.error("Add collaborator error:", error);
    return NextResponse.json(
      { error: "Failed to add collaborator" },
      { status: 500 }
    );
  }
}
