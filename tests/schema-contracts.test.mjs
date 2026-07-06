import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import { generateBlueprint } from "../blueprint-engine.mjs";
import { analyzeDataset } from "../dataset-profiler.mjs";
import {
  assertContract,
  validateBlueprintContract,
  validateDatasetProfileContract
} from "../schema-contracts.mjs";

test("schema files exist for agent, dataset, blueprint, and eval surfaces", () => {
  for (const path of [
    "schemas/mille-agent-task.schema.json",
    "schemas/mille-blueprint.schema.json",
    "schemas/mille-dataset-profile.schema.json",
    "schemas/mille-eval-record.schema.json"
  ]) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, `${path} should exist`);
  }
});

test("dataset profiler output satisfies the public dataset profile contract", () => {
  const csv = [
    "transaction_id,amount,merchant_risk,is_fraud",
    "t1,20,0.1,0",
    "t2,200,0.9,1",
    "t3,30,0.2,0"
  ].join("\n");
  const profile = analyzeDataset({ csvText: csv, filename: "fraud.csv", idea: "Detect fraud" });

  assertContract(validateDatasetProfileContract(profile), "dataset profile contract");
});

test("generated single-task blueprint satisfies the public blueprint contract", () => {
  const blueprint = generateBlueprint({
    idea: "Build a fraud scoring API. The table has merchant_risk, amount, prior_chargebacks, and an is_fraud label.",
    task: "classification",
    audience: "technical"
  });

  assertContract(validateBlueprintContract(blueprint), "blueprint contract");
});

test("generated dataset-aware blueprint satisfies both public contracts", () => {
  const csv = [
    "transaction_id,amount,merchant_risk,is_fraud",
    "t1,20,0.1,0",
    "t2,200,0.9,1",
    "t3,30,0.2,0"
  ].join("\n");
  const profile = analyzeDataset({ csvText: csv, filename: "fraud.csv", idea: "Detect fraud" });
  const blueprint = generateBlueprint({
    idea: "Detect fraud from amount and merchant risk.",
    task: "classification",
    audience: "technical",
    dataset_profile: profile
  });

  assertContract(validateBlueprintContract(blueprint), "dataset-aware blueprint contract");
});

test("contract validation returns actionable errors", () => {
  const result = validateBlueprintContract({ title: "Broken" });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("blueprint.engine_name")));
  assert.ok(result.errors.some((error) => error.includes("blueprint.decision")));
});
