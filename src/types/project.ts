export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  ownerId: string;
}

export type ProjectRole = "owner" | "editor" | "viewer";

export interface ProjectWithRole extends Project {
  role: ProjectRole;
  owner?: {
    id: string;
    name: string | null;
    email: string;
  };
}

export interface ProjectCollaborator {
  id: string;
  userId: string;
  projectId: string;
  role: string;
  createdAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  };
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
}
