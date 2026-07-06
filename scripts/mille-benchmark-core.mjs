import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { generateBlueprint } from "../blueprint-engine.mjs";
import { validateBlueprintContract } from "../schema-contracts.mjs";

export const DEFAULT_THRESHOLDS = {
  overall_score: 0.85,
  contract_pass_rate: 1,
  task_correctness_rate: 0.95,
  must_have_coverage: 0.9,
  failure_avoidance: 0.95,
  hard_case_score: 0.75
};

const STOP_WORDS = new Set([
  "and",
  "are",
  "for",
  "from",
  "has",
  "have",
  "into",
  "must",
  "not",
  "only",
  "the",
  "this",
  "with"
]);

export function readJsonl(pathLike) {
  const text = readFileSync(pathLike, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map((line) => JSON.parse(line));
}

function stableStringify(value) {
  return JSON.stringify(value, null, 2);
}

function blueprintText(blueprint) {
  return [
    blueprint.title,
    blueprint.project_type,
    blueprint.task_type,
    blueprint.confidence,
    stableStringify(blueprint.summary || {}),
    stableStringify(blueprint.data_contract || []),
    stableStringify(blueprint.model_path || []),
    stableStringify(blueprint.decision || {}),
    stableStringify(blueprint.decision_trace || []),
    stableStringify(blueprint.consequences || {}),
    stableStringify(blueprint.component_consequences || {}),
    stableStringify(blueprint.components || []),
    stableStringify(blueprint.agent_spec || {})
  ]
    .join("\n")
    .toLowerCase();
}

function tokens(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, " ")
    .split(/\s+/)
    .filter((token) => (token.length > 2 || token === "id" || token === "ml") && !STOP_WORDS.has(token));
}

function coverageForPhrase(text, phrase) {
  const phraseTokens = tokens(phrase);
  if (!phraseTokens.length) return { passed: true, matched: [], total: 0, ratio: 1 };
  const matched = phraseTokens.filter((token) => {
    if (text.includes(token)) return true;
    if (/exclusion|exclude|excluded/.test(token) && /exclud/.test(text)) return true;
    if (/handling|handle|handled/.test(token) && /handl/.test(text)) return true;
    if (/validation|validate|validated/.test(token) && /validat/.test(text)) return true;
    if (/warning|warn|warnings/.test(token) && /warn/.test(text)) return true;
    return false;
  });
  const required = phraseTokens.length <= 2 ? 1 : Math.max(1, Math.ceil(phraseTokens.length * 0.6));
  return {
    passed: matched.length >= required,
    matched,
    total: phraseTokens.length,
    ratio: matched.length / phraseTokens.length
  };
}

function taskMatches(record, blueprint) {
  if (record.task === "multi_component_system") {
    return blueprint.project_type === "multi_component_system";
  }
  return blueprint.task_type === record.task;
}

function datasetAwareness(record, blueprint) {
  const profile = record.dataset_profile;
  if (!profile) {
    return {
      passed: true,
      checks: [{ id: "no_dataset_profile", passed: true, details: "No dataset profile on record." }]
    };
  }

  const expected = record.expected_blueprint || {};
  const expectedDecision = expected.decision || {};
  const actualDecision = blueprint.decision || {};
  const actualFeatures = new Set(actualDecision.features || []);
  const idColumns = profile.inferred?.id_columns || [];
  const excludedIds = idColumns.filter((column) => !actualFeatures.has(column));
  const expectedFeatures = expectedDecision.features || [];
  const retainedFeatures = expectedFeatures.filter((feature) => actualFeatures.has(feature));

  const checks = [
    {
      id: "target_matches_expected",
      passed: (actualDecision.target || null) === (expectedDecision.target || null),
      details: { expected: expectedDecision.target || null, actual: actualDecision.target || null }
    },
    {
      id: "id_columns_excluded",
      passed: excludedIds.length === idColumns.length,
      details: { id_columns: idColumns, excluded: excludedIds }
    },
    {
      id: "feature_groups_preserved",
      passed: expectedFeatures.length === 0 || retainedFeatures.length >= Math.ceil(expectedFeatures.length * 0.75),
      details: { expected_features: expectedFeatures, retained_features: retainedFeatures }
    },
    {
      id: "executable_checks_preserved",
      passed:
        (profile.executable_checks || []).length === 0 ||
        (blueprint.dataset_profile?.executable_checks || []).length >= (profile.executable_checks || []).length,
      details: {
        expected_count: (profile.executable_checks || []).length,
        actual_count: (blueprint.dataset_profile?.executable_checks || []).length
      }
    },
    {
      id: "leakage_warnings_preserved",
      passed:
        (profile.leakage_warnings || []).length === 0 ||
        (blueprint.dataset_profile?.leakage_warnings || []).length >= (profile.leakage_warnings || []).length,
      details: {
        expected_count: (profile.leakage_warnings || []).length,
        actual_count: (blueprint.dataset_profile?.leakage_warnings || []).length
      }
    }
  ];

  return {
    passed: checks.every((check) => check.passed),
    checks
  };
}

function rubricCoverage(text, phrases) {
  const phraseResults = phrases.map((phrase) => ({
    phrase,
    ...coverageForPhrase(text, phrase)
  }));
  const passedCount = phraseResults.filter((item) => item.passed).length;
  return {
    passed: phrases.length === 0 || passedCount / phrases.length >= 0.8,
    passed_count: passedCount,
    total: phrases.length,
    ratio: phrases.length === 0 ? 1 : passedCount / phrases.length,
    phrases: phraseResults
  };
}

function failureAvoidance(text, failureModes, blueprint) {
  const results = failureModes.map((mode) => {
    const normalizedText = tokens(text).join(" ");
    const modeTokens = tokens(mode);
    const lowerMode = String(mode).toLowerCase();
    const usingFeatureMatch = lowerMode.match(/using\s+([a-z0-9_]+)\s+as\s+feature/);
    if (usingFeatureMatch) {
      return {
        mode,
        passed: !(blueprint.decision?.features || []).includes(usingFeatureMatch[1])
      };
    }
    if (lowerMode.includes("random split")) {
      return { mode, passed: blueprint.decision?.split_strategy !== "random" };
    }
    if (lowerMode.includes("accuracy-only") || lowerMode.includes("accuracy only")) {
      return { mode, passed: !/accuracy/i.test(blueprint.decision?.primary_metric || "") };
    }
    const isMissingStyle = /^(no|missing|ignoring|ignore|lacks?|without)\b/.test(lowerMode);
    const triggered = isMissingStyle
      ? modeTokens.filter((token) => normalizedText.includes(token)).length < Math.max(1, Math.ceil(modeTokens.length * 0.5))
      : modeTokens.join(" ").length > 0 && normalizedText.includes(modeTokens.join(" "));
    return { mode, passed: !triggered };
  });
  const passedCount = results.filter((item) => item.passed).length;
  return {
    passed: failureModes.length === 0 || passedCount / failureModes.length >= 0.95,
    passed_count: passedCount,
    total: failureModes.length,
    ratio: failureModes.length === 0 ? 1 : passedCount / failureModes.length,
    modes: results
  };
}

export function generateBlueprintForRecord(record, provider = "local-engine") {
  if (provider !== "local-engine") {
    throw new Error(`Unsupported benchmark provider: ${provider}`);
  }
  return generateBlueprint({
    idea: record.prompt,
    task: record.task === "multi_component_system" ? "auto" : record.task,
    audience: "technical",
    dataset_profile: record.dataset_profile || null
  });
}

export function scoreBenchmarkRecord(record, blueprint) {
  const contract = validateBlueprintContract(blueprint);
  const text = blueprintText(blueprint);
  const dataset = datasetAwareness(record, blueprint);
  const mustHave = rubricCoverage(text, record.rubric?.must_have || []);
  const shouldHave = rubricCoverage(text, record.rubric?.should_have || []);
  const failures = failureAvoidance(text, record.failure_modes || [], blueprint);
  const taskPassed = taskMatches(record, blueprint);

  const checks = [
    { id: "contract_validity", passed: contract.ok, weight: 25, details: { errors: contract.errors } },
    {
      id: "task_correctness",
      passed: taskPassed,
      weight: 20,
      details: { expected: record.task, actual_task: blueprint.task_type, actual_project_type: blueprint.project_type }
    },
    { id: "dataset_awareness", passed: dataset.passed, weight: 20, details: dataset.checks },
    { id: "must_have_rubric", passed: mustHave.passed, weight: 15, details: mustHave },
    { id: "should_have_rubric", passed: shouldHave.passed, weight: 5, details: shouldHave },
    { id: "failure_avoidance", passed: failures.passed, weight: 15, details: failures }
  ];

  const score = checks.reduce((total, check) => total + (check.passed ? check.weight : 0), 0);
  const maxScore = checks.reduce((total, check) => total + check.weight, 0);
  return {
    id: record.id,
    domain: record.domain,
    task: record.task,
    score,
    max_score: maxScore,
    passed: score / maxScore >= DEFAULT_THRESHOLDS.overall_score && contract.ok && taskPassed,
    checks
  };
}

function isHardCase(record) {
  return (
    record.task === "multi_component_system" ||
    (record.dataset_profile?.leakage_warnings || []).length > 0 ||
    record.expected_blueprint?.consequences?.verdict === "needs_resolution" ||
    record.expected_blueprint?.component_consequences?.verdict === "needs_resolution"
  );
}

function summarizeBy(results, key) {
  const groups = new Map();
  for (const result of results) {
    const groupKey = result[key] || "unknown";
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(result);
  }
  return Object.fromEntries(
    Array.from(groups.entries()).map(([groupKey, groupResults]) => [
      groupKey,
      {
        records: groupResults.length,
        score: groupResults.reduce((total, result) => total + result.score, 0),
        max_score: groupResults.reduce((total, result) => total + result.max_score, 0),
        score_ratio:
          groupResults.reduce((total, result) => total + result.score, 0) /
          groupResults.reduce((total, result) => total + result.max_score, 0)
      }
    ])
  );
}

function checkRate(results, checkId) {
  const checks = results.map((result) => result.checks.find((check) => check.id === checkId)).filter(Boolean);
  const passed = checks.filter((check) => check.passed).length;
  return checks.length === 0 ? 1 : passed / checks.length;
}

function detailRatio(results, checkId) {
  const details = results
    .map((result) => result.checks.find((check) => check.id === checkId)?.details)
    .filter((detail) => detail && Number.isFinite(detail.ratio));
  const passed = details.reduce((total, detail) => total + detail.passed_count, 0);
  const total = details.reduce((sum, detail) => sum + detail.total, 0);
  return total === 0 ? 1 : passed / total;
}

export function summarizeBenchmark(records, results, thresholds = DEFAULT_THRESHOLDS) {
  const totalScore = results.reduce((total, result) => total + result.score, 0);
  const totalMaxScore = results.reduce((total, result) => total + result.max_score, 0);
  const hardResults = results.filter((result, index) => isHardCase(records[index]));
  const hardScore = hardResults.reduce((total, result) => total + result.score, 0);
  const hardMaxScore = hardResults.reduce((total, result) => total + result.max_score, 0);
  const topFailedChecks = {};
  for (const result of results) {
    for (const check of result.checks) {
      if (!check.passed) topFailedChecks[check.id] = (topFailedChecks[check.id] || 0) + 1;
    }
  }

  const metrics = {
    record_count: results.length,
    overall_score: totalMaxScore === 0 ? 0 : totalScore / totalMaxScore,
    contract_pass_rate: checkRate(results, "contract_validity"),
    task_correctness_rate: checkRate(results, "task_correctness"),
    must_have_coverage: detailRatio(results, "must_have_rubric"),
    failure_avoidance: detailRatio(results, "failure_avoidance"),
    hard_case_score: hardMaxScore === 0 ? 1 : hardScore / hardMaxScore
  };

  const gateChecks = Object.fromEntries(
    Object.entries(thresholds).map(([id, threshold]) => [id, { value: metrics[id], threshold, passed: metrics[id] >= threshold }])
  );

  return {
    passed: Object.values(gateChecks).every((check) => check.passed),
    metrics,
    thresholds,
    gate_checks: gateChecks,
    score_by_task: summarizeBy(results, "task"),
    score_by_domain: summarizeBy(results, "domain"),
    top_failed_checks: Object.entries(topFailedChecks)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({ id, count })),
    worst_records: [...results].sort((a, b) => a.score / a.max_score - b.score / b.max_score).slice(0, 10)
  };
}

export function runBenchmark(records, { provider = "local-engine" } = {}) {
  const results = records.map((record) => scoreBenchmarkRecord(record, generateBlueprintForRecord(record, provider)));
  return {
    provider,
    generated_at: new Date().toISOString(),
    summary: summarizeBenchmark(records, results),
    results
  };
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function tableRows(entries) {
  return Object.entries(entries)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => `| ${value.records} | ${percent(value.score_ratio)} |`)
    .join("\n");
}

function namedTableRows(entries) {
  return Object.entries(entries)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `| ${name} | ${value.records} | ${percent(value.score_ratio)} |`)
    .join("\n");
}

export function renderMarkdownReport(run) {
  const { summary } = run;
  const gateRows = Object.entries(summary.gate_checks)
    .map(
      ([id, check]) =>
        `| ${id} | ${percent(check.value)} | ${percent(check.threshold)} | ${check.passed ? "pass" : "fail"} |`
    )
    .join("\n");
  const failedRows =
    summary.top_failed_checks.length === 0
      ? "| none | 0 |"
      : summary.top_failed_checks.map((item) => `| ${item.id} | ${item.count} |`).join("\n");
  const worstRows = summary.worst_records
    .map((record) => `| ${record.id} | ${record.task} | ${record.domain} | ${percent(record.score / record.max_score)} |`)
    .join("\n");

  return [
    "# MILLE Benchmark Report",
    "",
    `Provider: ${run.provider}`,
    `Generated: ${run.generated_at}`,
    `Overall: ${summary.passed ? "PASS" : "FAIL"}`,
    "",
    "## Gate Checks",
    "",
    "| Metric | Value | Threshold | Result |",
    "| --- | ---: | ---: | --- |",
    gateRows,
    "",
    "## Score By Task",
    "",
    "| Task | Records | Score |",
    "| --- | ---: | ---: |",
    namedTableRows(summary.score_by_task),
    "",
    "## Score By Domain",
    "",
    "| Domain | Records | Score |",
    "| --- | ---: | ---: |",
    namedTableRows(summary.score_by_domain),
    "",
    "## Top Failed Checks",
    "",
    "| Check | Count |",
    "| --- | ---: |",
    failedRows,
    "",
    "## Worst Records",
    "",
    "| Record | Task | Domain | Score |",
    "| --- | --- | --- | ---: |",
    worstRows,
    "",
    "## Recommended Next Fixes",
    "",
    summary.top_failed_checks.length === 0
      ? "- No benchmark check failures were found."
      : "- Start with the most frequent failed checks above and inspect the listed worst records.",
    "- Keep record-level JSON results for exact check details.",
    ""
  ].join("\n");
}

export function writeBenchmarkOutputs(run, outputDir) {
  const jsonPath = join(outputDir, "results.json");
  const markdownPath = join(outputDir, "report.md");
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(run, null, 2)}\n`);
  writeFileSync(markdownPath, renderMarkdownReport(run));
  return { jsonPath, markdownPath };
}

export function defaultRecordsPath() {
  return fileURLToPath(new URL("../hf-dataset/mille-agent-blueprints/records.jsonl", import.meta.url));
}

export function defaultOutputDir() {
  return fileURLToPath(new URL("../evals/mille-benchmark/", import.meta.url));
}
