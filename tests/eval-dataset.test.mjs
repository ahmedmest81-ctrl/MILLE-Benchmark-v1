import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateBlueprintContract, validateDatasetProfileContract } from "../schema-contracts.mjs";

test("seed eval dataset records satisfy public contracts", () => {
  const text = readFileSync(new URL("../hf-dataset/mille-agent-blueprints/records.jsonl", import.meta.url), "utf8");
  const records = text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  assert.equal(records.length, 200);
  assert.deepEqual(
    records.reduce((counts, record) => {
      counts[record.task] = (counts[record.task] || 0) + 1;
      return counts;
    }, {}),
    {
      classification: 50,
      regression: 35,
      forecasting: 35,
      recommendation: 25,
      clustering: 20,
      multi_component_system: 35
    }
  );
  assert.ok(records.filter((record) => record.dataset_profile).length >= 140);

  for (const record of records) {
    assert.ok(record.id);
    assert.ok(record.prompt);
    assert.ok(record.rubric.must_have.length > 0);
    assert.ok(record.failure_modes.length > 0);

    const blueprintResult = validateBlueprintContract(record.expected_blueprint);
    assert.deepEqual(blueprintResult.errors, [], `${record.id} blueprint contract errors`);

    if (record.dataset_profile) {
      const profileResult = validateDatasetProfileContract(record.dataset_profile);
      assert.deepEqual(profileResult.errors, [], `${record.id} dataset profile contract errors`);
    }
  }
});
