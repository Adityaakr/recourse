// Deterministic model backend: no network, no keys. Returns the task's
// reference solution so the whole repo runs offline. This is the default so a
// stranger can run the demo with zero API keys.

import type { Task } from "@recourse/tasks";

export function mockSolve(task: Task): string {
  return task.reference;
}
