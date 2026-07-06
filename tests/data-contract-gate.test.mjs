import assert from "node:assert/strict";
import test from "node:test";

import { generateBlueprint } from "../blueprint-engine.mjs";
import { evaluateBlueprint } from "../consequence-core.mjs";
import { analyzeDataset } from "../dataset-profiler.mjs";
import { parseIdeaClaims } from "../idea-claims.mjs";
import { buildProjectFiles } from "../project-export.mjs";

function fieldByName(fields, name) {
  return fields.find((field) => field.field === name);
}

test("data-contract-gate blocks unvalidated fraud scoring inputs", () => {
  const idea =
    "Build a fraud scoring API. The table has merchant_risk, amount, prior_chargebacks, and an is_fraud label.";
  const blueprint = generateBlueprint({ idea, task: "classification", audience: "technical" });
  const gate = blueprint.consequences.blocking.find((item) => item.id === "data-contract-gate");

  assert.ok(gate);
  assert.equal(gate.severity, "block");
  assert.equal(blueprint.decision.requires_input_validation, true);
  assert.equal(fieldByName(gate.computed.fields, "merchant_risk").kind, "probability");
  assert.equal(fieldByName(gate.computed.fields, "merchant_risk").rule, "0 <= x <= 1");
  assert.equal(fieldByName(gate.computed.fields, "amount").kind, "amount");
  assert.equal(fieldByName(gate.computed.fields, "amount").rule, "x >= 0");
  assert.equal(fieldByName(gate.computed.fields, "prior_chargebacks").kind, "count");
  assert.equal(fieldByName(gate.computed.fields, "prior_chargebacks").rule, "integer x >= 0");
  assert.match(gate.message, /reject booleans/i);
});

test("data-contract-gate generates executable validator and rejection tests", () => {
  const idea =
    "Build a fraud scoring model. The table has merchant_risk, amount, prior_chargebacks, and an is_fraud label.";
  const blueprint = generateBlueprint({ idea, task: "classification", audience: "technical" });
  const files = new Map(buildProjectFiles(blueprint).map((entry) => [entry.path, new TextDecoder().decode(entry.bytes)]));

  assert.match(blueprint.files["validation.py"], /def validate_features/);
  assert.match(blueprint.files["validation.py"], /_reject_bool_number/);
  assert.match(blueprint.files["validation.py"], /merchant_risk/);
  assert.match(blueprint.files["validation.py"], /amount/);
  assert.match(blueprint.files["validation.py"], /prior_chargebacks/);
  assert.match(blueprint.files["inference.py"], /validate_features/);
  assert.match(blueprint.files["test_input_validation.py"], /1\.7/);
  assert.match(blueprint.files["test_input_validation.py"], /-5/);
  assert.match(blueprint.files["test_input_validation.py"], /True/);
  assert.ok(files.has("project/src/validation.py"));
  assert.ok(files.has("project/tests/test_input_validation.py"));
});

test("ambiguous score-like input asks for type assertion without hard block", () => {
  const idea = "Predict fraud from device_score and card_country.";
  const blueprint = generateBlueprint({ idea, task: "classification", audience: "technical" });
  const gate = blueprint.consequences.all.find((item) => item.id === "data-contract-gate");

  assert.equal(gate.fired, true);
  assert.equal(gate.severity, "warn");
  assert.equal(gate.computed.fields[0].field, "device_score");
  assert.equal(gate.computed.fields[0].kind, "unknown");
  assert.ok(gate.questions.some((question) => /device_score/.test(question)));
  assert.equal(blueprint.decision.confidence, "needs_resolution");
});

test("already validated draft does not re-fire data-contract-gate", () => {
  const claims = parseIdeaClaims("Detect fraud from merchant_risk, amount, and is_fraud.");
  const result = evaluateBlueprint({
    claims,
    draft: {
      task_type: "classification",
      features: ["merchant_risk", "amount"],
      target: "is_fraud",
      requires_input_validation: true,
      input_constraints: [{ field: "merchant_risk", kind: "probability", rule: "0 <= x <= 1", nullable: false }]
    }
  });
  const gate = result.all.find((item) => item.id === "data-contract-gate");

  assert.equal(gate.fired, false);
  assert.equal(result.blocking.some((item) => item.id === "data-contract-gate"), false);
});

test("categorical and id-only inputs do not hard block", () => {
  const csv = [
    "transaction_id,card_country,device_type,is_fraud",
    "t1,AT,mobile,0",
    "t2,DE,web,1",
    "t3,AT,web,0"
  ].join("\n");
  const profile = analyzeDataset({ csvText: csv, filename: "categorical.csv", idea: "Detect fraud." });
  const blueprint = generateBlueprint({ idea: "Detect fraud.", task: "classification", audience: "technical", dataset_profile: profile });

  assert.equal(blueprint.consequences.blocking.some((item) => item.id === "data-contract-gate"), false);
});
