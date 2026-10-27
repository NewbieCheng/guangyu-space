import assert from "node:assert/strict";
import test from "node:test";
import { buildTaskGroupPlan, TASK_PROJECT_TYPES } from "./task-groups";

void test("task groups map project enums to the six requested headings", () => {
  const references = TASK_PROJECT_TYPES.map(({ value }, index) => ({
    id: `task-${index}`,
    projectId: `project-${index}`,
    priority: "P1",
    plannedDate: null,
    project: {
      id: `project-${index}`,
      businessNumber: `XM${index}`,
      name: `项目${index}`,
      region: value,
    },
  }));

  const result = buildTaskGroupPlan(references, 1, 50);

  assert.deepEqual(
    result.regions.map(({ label }) => label),
    ["服务型", "产品型", "经营型", "探索型", "非经营型", "学习排期"],
  );
  assert.deepEqual(
    result.regions.map(({ total }) => total),
    [1, 1, 1, 1, 1, 1],
  );
});

void test("project groups page by group and sort tasks by priority then planned date", () => {
  const references = [
    {
      id: "late",
      projectId: "project-a",
      priority: "P1",
      plannedDate: "2026-10-20",
      project: {
        id: "project-a",
        businessNumber: "XM2",
        name: "乙项目",
        region: "SERVICE",
      },
    },
    {
      id: "high",
      projectId: "project-a",
      priority: "P0",
      plannedDate: "2026-10-21",
      project: {
        id: "project-a",
        businessNumber: "XM2",
        name: "乙项目",
        region: "SERVICE",
      },
    },
    {
      id: "early",
      projectId: "project-a",
      priority: "P1",
      plannedDate: "2026-10-10",
      project: {
        id: "project-a",
        businessNumber: "XM2",
        name: "乙项目",
        region: "SERVICE",
      },
    },
    {
      id: "first-project",
      projectId: "project-b",
      priority: "P1",
      plannedDate: null,
      project: {
        id: "project-b",
        businessNumber: "XM1",
        name: "甲项目",
        region: "SERVICE",
      },
    },
  ];

  const firstPage = buildTaskGroupPlan(references, 1, 20);

  assert.equal(firstPage.totalGroups, 2);
  assert.equal(firstPage.regions[0]?.projects[0]?.projectId, "project-b");
  assert.equal(firstPage.regions[0]?.projects[1]?.projectId, "project-a");
  assert.deepEqual(firstPage.regions[0]?.projects[1]?.taskIds, [
    "high",
    "early",
    "late",
  ]);
});

void test("unassigned tasks are counted as one group and can be paginated separately", () => {
  const references = [
    ...Array.from({ length: 20 }, (_, index) => ({
      id: `task-${index}`,
      projectId: `project-${index}`,
      priority: "P1",
      plannedDate: null,
      project: {
        id: `project-${index}`,
        businessNumber: `XM${String(index).padStart(3, "0")}`,
        name: `项目${index}`,
        region: "SERVICE",
      },
    })),
    {
      id: "without-project",
      projectId: null,
      priority: "P1",
      plannedDate: null,
      project: null,
    },
  ];

  const lastPage = buildTaskGroupPlan(references, 2, 20);

  assert.equal(lastPage.totalGroups, 21);
  assert.equal(lastPage.unassigned.total, 1);
  assert.deepEqual(lastPage.unassigned.taskIds, ["without-project"]);
  assert.equal(lastPage.totalPages, 2);
});
