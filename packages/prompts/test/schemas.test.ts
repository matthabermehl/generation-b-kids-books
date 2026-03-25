import { describe, expect, it } from "vitest";
import { storyConceptJsonSchema, storyPackageJsonSchema } from "../src/index.js";

describe("json schemas", () => {
  it("keeps lessonScenario OpenAI-compatible without nested oneOf", () => {
    expect("oneOf" in storyConceptJsonSchema.properties.lessonScenario).toBe(false);
    expect("oneOf" in storyPackageJsonSchema.properties.concept.properties.lessonScenario).toBe(false);
  });

  it("marks every lessonScenario property as required for strict OpenAI schemas", () => {
    const lessonScenario = storyConceptJsonSchema.properties.lessonScenario;
    expect(new Set(lessonScenario.required)).toEqual(new Set(Object.keys(lessonScenario.properties)));
  });
});
