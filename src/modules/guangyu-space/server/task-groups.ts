export const TASK_PROJECT_TYPES = [
  { value: "SERVICE", label: "服务型" },
  { value: "PRODUCT", label: "产品型" },
  { value: "BUSINESS", label: "经营型" },
  { value: "EXPLORATION", label: "探索型" },
  { value: "NON_BUSINESS", label: "非经营型" },
  { value: "LEARNING", label: "学习排期" },
] as const;

export type TaskProjectType = (typeof TASK_PROJECT_TYPES)[number]["value"];
export type TaskListItem = { id: string; [key: string]: unknown };

export type TaskProjectGroup = {
  projectId: string;
  businessNumber: string;
  name: string;
  total: number;
  tasks: TaskListItem[];
};

export type TaskRegionGroup = {
  region: TaskProjectType;
  label: string;
  total: number;
  projects: TaskProjectGroup[];
};

export type TaskGroupsResponse = {
  regions: TaskRegionGroup[];
  unassigned: { total: number; tasks: TaskListItem[] };
  totalTasks: number;
  totalGroups: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type TaskReference = {
  id: string;
  projectId: string | null;
  priority: string;
  plannedDate: string | Date | null;
  project: {
    id: string;
    businessNumber: string;
    name: string;
    region: string;
  } | null;
};

type MutableProjectGroup = {
  projectId: string;
  businessNumber: string;
  name: string;
  tasks: TaskReference[];
};

export type TaskGroupPlan = {
  regions: Array<{
    region: TaskProjectType;
    label: string;
    total: number;
    projects: Array<{
      projectId: string;
      businessNumber: string;
      name: string;
      total: number;
      taskIds: string[];
    }>;
  }>;
  unassigned: { total: number; taskIds: string[] };
  totalTasks: number;
  totalGroups: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function plannedDateValue(value: TaskReference["plannedDate"]): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === "string" ? value.slice(0, 10) : null;
}

function compareTasks(left: TaskReference, right: TaskReference): number {
  const priority = { P0: 0, P1: 1, P2: 2 } as const;
  const priorityDifference =
    (priority[left.priority as keyof typeof priority] ?? 3) -
    (priority[right.priority as keyof typeof priority] ?? 3);
  if (priorityDifference) return priorityDifference;

  const leftDate = plannedDateValue(left.plannedDate);
  const rightDate = plannedDateValue(right.plannedDate);
  if (leftDate === null && rightDate !== null) return 1;
  if (leftDate !== null && rightDate === null) return -1;
  if (leftDate !== rightDate)
    return (leftDate ?? "").localeCompare(rightDate ?? "");
  return left.id.localeCompare(right.id);
}

function compareProjectNumbers(
  left: { businessNumber: string; projectId: string },
  right: { businessNumber: string; projectId: string },
): number {
  return (
    left.businessNumber.localeCompare(right.businessNumber, "zh-CN", {
      numeric: true,
      sensitivity: "base",
    }) || left.projectId.localeCompare(right.projectId)
  );
}

export function buildTaskGroupPlan(
  references: TaskReference[],
  requestedPage: number,
  requestedPageSize: number,
): TaskGroupPlan {
  const pageSize = [20, 50, 100].includes(requestedPageSize)
    ? requestedPageSize
    : 50;
  const projectTypes = new Set<string>(
    TASK_PROJECT_TYPES.map(({ value }) => value),
  );
  const byRegion = new Map<TaskProjectType, Map<string, MutableProjectGroup>>();
  const unassigned: TaskReference[] = [];

  for (const task of references) {
    const project = task.project;
    if (!project?.region || !projectTypes.has(project.region)) {
      unassigned.push(task);
      continue;
    }
    const region = project.region as TaskProjectType;
    const projects =
      byRegion.get(region) ?? new Map<string, MutableProjectGroup>();
    const group = projects.get(project.id) ?? {
      projectId: project.id,
      businessNumber: project.businessNumber,
      name: project.name,
      tasks: [],
    };
    group.tasks.push(task);
    projects.set(project.id, group);
    byRegion.set(region, projects);
  }

  for (const projects of byRegion.values()) {
    for (const project of projects.values()) project.tasks.sort(compareTasks);
  }
  unassigned.sort(compareTasks);

  const allProjects = TASK_PROJECT_TYPES.flatMap(({ value }) =>
    [...(byRegion.get(value)?.values() ?? [])].sort(compareProjectNumbers),
  );
  const totalGroups = allProjects.length + Number(unassigned.length > 0);
  const totalPages = Math.ceil(totalGroups / pageSize);
  const page = Math.min(
    Math.max(1, requestedPage || 1),
    Math.max(1, totalPages),
  );
  const firstGroup = (page - 1) * pageSize;
  const lastGroup = page * pageSize;
  const visibleProjectIds = new Set(
    allProjects
      .slice(firstGroup, lastGroup)
      .map((project) => project.projectId),
  );
  const unassignedVisible =
    unassigned.length > 0 &&
    lastGroup > allProjects.length &&
    firstGroup < totalGroups;

  const regions = TASK_PROJECT_TYPES.map(({ value, label }) => {
    const projects = [...(byRegion.get(value)?.values() ?? [])].sort(
      compareProjectNumbers,
    );
    return {
      region: value,
      label,
      total: projects.reduce((sum, project) => sum + project.tasks.length, 0),
      projects: projects
        .filter((project) => visibleProjectIds.has(project.projectId))
        .map((project) => ({
          projectId: project.projectId,
          businessNumber: project.businessNumber,
          name: project.name,
          total: project.tasks.length,
          taskIds: project.tasks.map((task) => task.id),
        })),
    };
  });

  return {
    regions,
    unassigned: {
      total: unassigned.length,
      taskIds: unassignedVisible ? unassigned.map((task) => task.id) : [],
    },
    totalTasks: references.length,
    totalGroups,
    page,
    pageSize,
    totalPages,
  };
}
