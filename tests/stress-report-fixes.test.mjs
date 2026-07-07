import assert from "node:assert/strict";
import test from "node:test";

import { callTool } from "../mcp-server.mjs";
import { generateBlueprint } from "../blueprint-engine.mjs";
import { analyzeDataset } from "../dataset-profiler.mjs";

test("MCP tool arguments are validated against advertised schemas", async () => {
  await assert.rejects(
    () => callTool("mille_generate_blueprint", { task: "banana" }),
    /Invalid arguments for mille_generate_blueprint/
  );
  await assert.rejects(
    () => callTool("mille_generate_blueprint", { idea: "ab" }),
    /idea must have length >= 3/
  );
  await assert.rejects(
    () => callTool("mille_generate_blueprint", { idea: "Predict churn.", extra: true }),
    /unexpected property extra/
  );
  await assert.rejects(
    () => callTool("mille_generate_blueprint", {
      idea: "Predict churn.",
      gate_answers: { minimum_recall: 1.5 }
    }),
    /minimum_recall must be <= 1/
  );
});

test("learnability gate blocks vague, impossible, and non-ML requests before export", async () => {
  for (const idea of [
    "Make an AI for my business",
    "Predict tomorrow's winning lottery numbers",
    "Build me a website with a login page",
    "asdf qwerty zxcv"
  ]) {
    const blueprint = generateBlueprint({ idea, task: "auto", audience: "technical" });
    assert.equal(blueprint.consequences.verdict, "needs_resolution", idea);
    assert.ok(blueprint.consequences.blocking.some((gate) => gate.id === "learnability-gate"), idea);
    assert.equal(blueprint.confidence, "Needs resolution", idea);

    const exportResult = await callTool("mille_export_project", {
      idea,
      include_zip_base64: true
    });
    assert.equal(exportResult.structuredContent.export_allowed, false, idea);
    assert.equal("zip_base64" in exportResult.structuredContent, false, idea);
  }
});

const ideaOnlyLoanDefault =
  "Predict whether a bank loan applicant will default within 12 months, using applicant demographics, credit score, income, and their loan repayment history so the bank can flag high-risk applications before approval.";

test("idea-only natural-language target blocks runnable training code and export", async () => {
  const blueprint = generateBlueprint({
    idea: ideaOnlyLoanDefault,
    task: "classification",
    audience: "technical"
  });
  const targetGate = blueprint.consequences.blocking.find((gate) => gate.id === "identifiable-target-gate");
  const trainPy = blueprint.files["train.py"] || "";

  assert.ok(targetGate);
  assert.equal(targetGate.severity, "block");
  assert.match(targetGate.message, /target column name could not be determined/i);
  assert.match(trainPy, /NotImplementedError/);
  assert.match(trainPy, /target column/i);
  assert.doesNotMatch(trainPy, /TARGET = "whether a bank loan applicant/);
  assert.doesNotMatch(trainPy, /FEATURES = \[\]/);

  const scoreResult = await callTool("mille_score_blueprint", { blueprint });
  assert.notEqual(scoreResult.structuredContent.verdict, "ready");
  assert.ok(scoreResult.structuredContent.score < 100);
  assert.equal(
    scoreResult.structuredContent.checks.find((check) => check.id === "no_blocking_gates").passed,
    false
  );

  const exportResult = await callTool("mille_export_project", {
    idea: ideaOnlyLoanDefault,
    task: "classification",
    audience: "technical",
    include_zip_base64: true
  });
  assert.equal(exportResult.structuredContent.export_allowed, false);
  assert.equal("zip_base64" in exportResult.structuredContent, false);
  assert.ok(
    exportResult.structuredContent.blocking_gates.some((gate) => gate.id === "identifiable-target-gate")
  );
});

test("idea-only named columns still resolve a runnable target", () => {
  const blueprint = generateBlueprint({
    idea: "Predict loan default. Table has columns applicant_id, income, credit_score, prior_defaults, defaulted.",
    task: "classification",
    audience: "technical"
  });

  assert.equal(blueprint.decision.target, "defaulted");
  assert.ok(blueprint.decision.features.includes("income"));
  assert.ok(blueprint.decision.features.includes("credit_score"));
  assert.ok(blueprint.decision.features.includes("prior_defaults"));
  assert.ok(!blueprint.decision.features.includes("applicant_id"));
  assert.equal(blueprint.consequences.blocking.some((gate) => gate.id === "identifiable-target-gate"), false);
  assert.match(blueprint.files["train.py"], /TARGET = "defaulted"/);
  assert.doesNotMatch(blueprint.files["train.py"], /NotImplementedError/);
});

test("dataset profile target bypasses idea-only target gate", () => {
  const csv = [
    "applicant_id,income,credit_score,prior_defaults,defaulted",
    "a1,52000,650,0,0",
    "a2,31000,580,2,1",
    "a3,76000,720,0,0",
    "a4,28000,560,3,1"
  ].join("\n");
  const profile = analyzeDataset({
    csvText: csv,
    filename: "loans.csv",
    idea: ideaOnlyLoanDefault
  });
  const blueprint = generateBlueprint({
    idea: ideaOnlyLoanDefault,
    task: "classification",
    audience: "technical",
    dataset_profile: profile
  });

  assert.equal(blueprint.decision.target, "defaulted");
  assert.equal(blueprint.consequences.blocking.some((gate) => gate.id === "identifiable-target-gate"), false);
  assert.match(blueprint.files["train.py"], /TARGET = "defaulted"/);
  assert.doesNotMatch(blueprint.files["train.py"], /NotImplementedError/);
});

test("invalid gate answers do not resolve blocking gates and unknown accepts are surfaced", () => {
  const blueprint = generateBlueprint({
    idea: "Predict churn next month.",
    task: "classification",
    audience: "technical",
    gate_answers: {
      cutoff_date: "banana-not-a-date",
      accepted_gate_ids: ["does-not-exist"]
    }
  });
  const splitGate = blueprint.consequences.blocking.find((gate) => gate.id === "split-validity");

  assert.equal(splitGate.resolution_status, "blocking");
  assert.match(splitGate.resolution_note, /valid cutoff date/);
  assert.ok(blueprint.decision.gate_resolution.invalid_answers.cutoff_date);
  assert.deepEqual(blueprint.decision.gate_resolution.ignored_accepted_gate_ids, ["does-not-exist"]);
});

test("risk acceptance caps confidence at medium and preserves warn verdict", () => {
  const blueprint = generateBlueprint({
    idea: "Predict churn next month.",
    task: "classification",
    audience: "technical",
    gate_answers: {
      accepted_gate_ids: ["split-validity"]
    }
  });

  assert.equal(blueprint.consequences.verdict, "needs_resolution");
  assert.ok(blueprint.consequences.blocking.some((gate) => gate.id === "identifiable-target-gate"));
  assert.equal(blueprint.decision.confidence, "needs_resolution");
  assert.equal(blueprint.confidence, "Needs resolution");
});

test("temporal stream language fires split validity instead of a random split", () => {
  const blueprint = generateBlueprint({
    idea: "Build an ICU sepsis early warning model from real-time vital sign streams.",
    task: "classification",
    audience: "technical"
  });

  assert.ok(blueprint.consequences.blocking.some((gate) => gate.id === "split-validity"));
  assert.equal(blueprint.decision.split_strategy, "temporal");
});

test("single-task prompts do not become platforms from domain words alone", () => {
  for (const idea of [
    "Predict loan default from borrower income, credit score, and prior delinquencies.",
    "Route support tickets to the right team from ticket text.",
    "Predict courier delivery time from route distance and weather.",
    "Predict clinic appointment no-shows from patient and appointment features."
  ]) {
    const blueprint = generateBlueprint({ idea, task: "auto", audience: "technical" });
    assert.equal(blueprint.project_type, "single_task", idea);
  }
});

test("quantity target terms favor regression and anomaly terms favor clustering path", () => {
  const yieldBlueprint = generateBlueprint({
    idea: "Predict crop yield per hectare from weather, soil, and irrigation data.",
    task: "auto",
    audience: "technical"
  });
  const etaBlueprint = generateBlueprint({
    idea: "Predict courier delivery time from package, route, and traffic features.",
    task: "auto",
    audience: "technical"
  });
  const anomalyBlueprint = generateBlueprint({
    idea: "Detect anomalies in server metrics without incident labels.",
    task: "auto",
    audience: "technical"
  });

  assert.equal(yieldBlueprint.task_type, "regression");
  assert.equal(etaBlueprint.task_type, "regression");
  assert.equal(anomalyBlueprint.task_type, "clustering");
});

test("profiler blocks constant targets, binary junk, and missingness leakage", () => {
  assert.throws(
    () => analyzeDataset({ csvText: "\x00\x01\xff PK\x03\x04", filename: "junk.csv" }),
    /not look like delimited text/
  );

  const constantProfile = analyzeDataset({
    csvText: "customer_id,usage,churned\nc1,5,0\nc2,6,0\nc3,7,0",
    filename: "constant.csv",
    idea: "Predict churned."
  });
  assert.ok(
    constantProfile.quality_warnings.some((warning) => warning.severity === "block" && /zero variance/i.test(warning.reason))
  );

  const missingnessProfile = analyzeDataset({
    csvText: "customer_id,churn_date,churned\nc1,2026-01-01,1\nc2,,0\nc3,2026-02-01,1\nc4,,0",
    filename: "missingness.csv",
    idea: "Predict churned."
  });
  assert.ok(
    missingnessProfile.leakage_warnings.some((warning) => warning.column === "churn_date" && warning.severity === "block")
  );
});
