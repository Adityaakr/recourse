// json-schema-v1: grade a delivered JSON document against the task's schema
// with ajv in strict mode. Not exercised by the v1 demo task (which uses
// unit-tests-v1) but shipped so the second verifier kind is real, not a stub.

import Ajv from "ajv";
import type { Task } from "@recourse/tasks";
import type { GradeResult } from "./unit-tests-v1.js";

export function gradeJsonSchema(output: string, task: Task): GradeResult {
  // For json-schema tasks the `testFile` field carries the JSON Schema.
  let schema: object;
  let data: unknown;
  try {
    schema = JSON.parse(task.testFile);
    data = JSON.parse(output);
  } catch (e) {
    return { pass: false, evidence: `invalid JSON: ${String(e)}` };
  }
  const ajv = new Ajv({ strict: true, allErrors: true });
  const validate = ajv.compile(schema);
  const ok = validate(data);
  return {
    pass: !!ok,
    evidence: ok ? "schema valid" : JSON.stringify(validate.errors, null, 2),
  };
}
