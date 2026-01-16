import { NextRequest, NextResponse } from "next/server";
import { isDatabaseAvailable } from "@/lib/db";
import { getUser } from "@/lib/auth/middleware";
import {
  removeCollaborator,
  getProjectCollaborators,
} from "@/lib/services/project";

// DELETE /api/projects/[projectId]/collaborators/[userId] - Remove collaborator
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; userId: string }> }
) {
  try {
    if (!isDatabaseAvailable()) {
      return NextResponse.json(
        { error: "Collaborators unavailable in demo mode. Database not configured." },
        { status: 503 }
      );
    }

    const user = await getUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId, userId: targetUserId } = await params;

    const removed = await removeCollaborator(projectId, user.id, targetUserId);

    if (!removed) {
      return NextResponse.json(
        { error: "Not authorized or collaborator not found" },
        { status: 404 }
      );
    }

    // Return updated collaborators list
    const collaborators = await getProjectCollaborators(projectId);

    return NextResponse.json({ collaborators });
  } catch (error) {
    console.error("Remove collaborator error:", error);
    return NextResponse.json(
      { error: "Failed to remove collaborator" },
      { status: 500 }
    );
  }
}
