import { afterEach, describe, expect, it } from "vitest";
import {
  createCallBudget,
  StudySessionCallBudgetExceededError,
  getStudySessionMaxCallsPerJob,
  getStudySessionMinIntervalHours,
} from "./callBudget";

describe("callBudget", () => {
  afterEach(() => {
    delete process.env.CLOUD_STUDY_SESSION_MAX_CALLS_PER_JOB;
    delete process.env.CLOUD_STUDY_SESSION_MIN_INTERVAL_HOURS;
  });

  it("accetta fino al limite e poi lancia StudySessionCallBudgetExceededError", () => {
    const budget = createCallBudget(3);
    budget.reserve();
    budget.reserve();
    budget.reserve();
    expect(budget.used).toBe(3);
    expect(() => budget.reserve()).toThrow(StudySessionCallBudgetExceededError);
    // Non deve incrementare oltre il limite quando rifiuta.
    expect(budget.used).toBe(3);
  });

  it("usa i default (40 / 24h) se le env var sono assenti o non numeriche", () => {
    expect(getStudySessionMaxCallsPerJob()).toBe(40);
    expect(getStudySessionMinIntervalHours()).toBe(24);

    process.env.CLOUD_STUDY_SESSION_MAX_CALLS_PER_JOB = "not-a-number";
    process.env.CLOUD_STUDY_SESSION_MIN_INTERVAL_HOURS = "-5";
    expect(getStudySessionMaxCallsPerJob()).toBe(40);
    expect(getStudySessionMinIntervalHours()).toBe(24);
  });

  it("rispetta i valori espliciti dalle env var", () => {
    process.env.CLOUD_STUDY_SESSION_MAX_CALLS_PER_JOB = "10";
    process.env.CLOUD_STUDY_SESSION_MIN_INTERVAL_HOURS = "48";
    expect(getStudySessionMaxCallsPerJob()).toBe(10);
    expect(getStudySessionMinIntervalHours()).toBe(48);
  });
});
