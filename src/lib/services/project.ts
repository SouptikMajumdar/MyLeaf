import { db } from "@/lib/db";
import { ProjectWithRole, ProjectRole } from "@/types/project";

export async function createProject(
  userId: string,
  name: string,
  description?: string
): Promise<ProjectWithRole> {
  const project = await db.project.create({
    data: {
      name,
      description: description || null,
      ownerId: userId,
    },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return {
    ...project,
    role: "owner" as ProjectRole,
  };
}

export async function getProjects(userId: string): Promise<ProjectWithRole[]> {
  // Get owned projects
  const ownedProjects = await db.project.findMany({
    where: { ownerId: userId },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Get collaborated projects
  const collaborations = await db.projectCollaborator.findMany({
    where: { userId },
    include: {
      project: {
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  const owned: ProjectWithRole[] = ownedProjects.map((p) => ({
    ...p,
    role: "owner" as ProjectRole,
  }));

  const collaborated: ProjectWithRole[] = collaborations.map((c) => ({
    ...c.project,
    role: c.role as ProjectRole,
  }));

  // Combine and sort by updatedAt
  return [...owned, ...collaborated].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );
}

export async function getProject(
  projectId: string,
  userId: string
): Promise<ProjectWithRole | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      collaborators: {
        where: { userId },
      },
    },
  });

  if (!project) return null;

  // Check access
  if (project.ownerId === userId) {
    return { ...project, role: "owner" };
  }

  const collaboration = project.collaborators[0];
  if (collaboration) {
    return { ...project, role: collaboration.role as ProjectRole };
  }

  return null; // No access
}

export async function updateProject(
  projectId: string,
  userId: string,
  data: { name?: string; description?: string }
): Promise<ProjectWithRole | null> {
  // Check if user has edit access
  const project = await getProject(projectId, userId);
  if (!project || project.role === "viewer") {
    return null;
  }

  const updated = await db.project.update({
    where: { id: projectId },
    data: {
      name: data.name,
      description: data.description,
      updatedAt: new Date(),
    },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return { ...updated, role: project.role };
}

export async function deleteProject(
  projectId: string,
  userId: string
): Promise<boolean> {
  // Only owner can delete
  const project = await db.project.findUnique({
    where: { id: projectId },
  });

  if (!project || project.ownerId !== userId) {
    return false;
  }

  await db.project.delete({
    where: { id: projectId },
  });

  return true;
}

export async function getProjectCollaborators(projectId: string) {
  return db.projectCollaborator.findMany({
    where: { projectId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function addCollaborator(
  projectId: string,
  ownerId: string,
  email: string,
  role: "editor" | "viewer" = "editor"
): Promise<{ success: boolean; error?: string }> {
  // Verify owner
  const project = await db.project.findUnique({
    where: { id: projectId },
  });

  if (!project || project.ownerId !== ownerId) {
    return { success: false, error: "Not authorized" };
  }

  // Find user by email
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user) {
    return { success: false, error: "User not found" };
  }

  if (user.id === ownerId) {
    return { success: false, error: "Cannot add yourself as collaborator" };
  }

  // Check if already a collaborator
  const existing = await db.projectCollaborator.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId: user.id,
      },
    },
  });

  if (existing) {
    // Update role
    await db.projectCollaborator.update({
      where: { id: existing.id },
      data: { role },
    });
    return { success: true };
  }

  // Create new collaborator
  await db.projectCollaborator.create({
    data: {
      projectId,
      userId: user.id,
      role,
    },
  });

  return { success: true };
}

export async function removeCollaborator(
  projectId: string,
  ownerId: string,
  userId: string
): Promise<boolean> {
  // Verify owner
  const project = await db.project.findUnique({
    where: { id: projectId },
  });

  if (!project || project.ownerId !== ownerId) {
    return false;
  }

  await db.projectCollaborator.deleteMany({
    where: {
      projectId,
      userId,
    },
  });

  return true;
}

export async function checkProjectAccess(
  projectId: string,
  userId: string
): Promise<ProjectRole | null> {
  const project = await getProject(projectId, userId);
  return project?.role ?? null;
}
