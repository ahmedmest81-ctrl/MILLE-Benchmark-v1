import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { generateBlueprint } from "../blueprint-engine.mjs";
import { analyzeDataset } from "../dataset-profiler.mjs";
import {
  readJsonl,
  runBenchmark,
  scoreBenchmarkRecord,
  writeBenchmarkOutputs
} from "../scripts/mille-benchmark-core.mjs";

function sampleRecord() {
  const csv = [
    "transaction_id,amount,merchant_risk,prior_chargebacks,is_fraud",
    "t1,20,0.1,0,0",
    "t2,250,0.8,2,1",
    "t3,45,0.2,0,0",
    "t4,900,0.95,4,1"
  ].join("\n");
  const prompt =
    "Build a fraud scoring API. The table has transaction_id, amount, merchant_risk, prior_chargebacks, and an is_fraud label.";
  const profile = analyzeDataset({ csvText: csv, filename: "sample.csv", idea: prompt });
  return {
    id: "sample_fraud",
    prompt,
    task: "classification",
    domain: "fintech",
    input_schema: {},
    dataset_profile: profile,
    expected_blueprint: generateBlueprint({
      idea: prompt,
      task: "classification",
      audience: "technical",
      dataset_profile: profile
    }),
    rubric: {
      must_have: ["classification task", "is_fraud target", "ROC-AUC"],
      should_have: ["precision/recall", "input validation"]
    },
    failure_modes: ["using transaction_id as feature", "missing probability bounds"]
  };
}

test("benchmark JSONL reader parses records", () => {
  const dir = mkdtempSync(join(tmpdir(), "mille-benchmark-jsonl-"));
  const path = join(dir, "records.jsonl");
  writeFileSync(path, `${JSON.stringify({ id: "one" })}\n${JSON.stringify({ id: "two" })}\n`);

  assert.deepEqual(readJsonl(path), [{ id: "one" }, { id: "two" }]);
});

test("benchmark scorer passes a matching generated blueprint", () => {
  const record = sampleRecord();
  const result = scoreBenchmarkRecord(record, record.expected_blueprint);

  assert.equal(result.passed, true);
  assert.equal(result.checks.find((check) => check.id === "contract_validity").passed, true);
  assert.equal(result.checks.find((check) => check.id === "task_correctness").passed, true);
  assert.equal(result.checks.find((check) => check.id === "dataset_awareness").passed, true);
});

test("benchmark scorer fails a deliberately bad blueprint", () => {
  const record = sampleRecord();
  const badBlueprint = structuredClone(record.expected_blueprint);
  badBlueprint.task_type = "regression";
  badBlueprint.decision.task_type = "regression";
  badBlueprint.decision.features = ["transaction_id"];

  const result = scoreBenchmarkRecord(record, badBlueprint);

  assert.equal(result.passed, false);
  assert.equal(result.checks.find((check) => check.id === "task_correctness").passed, false);
  assert.equal(result.checks.find((check) => check.id === "dataset_awareness").passed, false);
});

test("benchmark runner writes JSON and Markdown reports", () => {
  const dir = mkdtempSync(join(tmpdir(), "mille-benchmark-output-"));
  const run = runBenchmark([sampleRecord()]);
  const outputs = writeBenchmarkOutputs(run, dir);

  assert.equal(existsSync(outputs.jsonPath), true);
  assert.equal(existsSync(outputs.markdownPath), true);
  assert.ok(JSON.parse(readFileSync(outputs.jsonPath, "utf8")).summary);
  assert.match(readFileSync(outputs.markdownPath, "utf8"), /# MILLE Benchmark Report/);
});
