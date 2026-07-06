const TASK_TYPES = new Set([
  "classification",
  "regression",
  "forecasting",
  "recommendation",
  "clustering",
  "optimization",
  "anomaly_detection",
  "dashboard",
  "api"
]);

const CONFIDENCE_LEVELS = new Set(["high", "medium", "low", "needs_resolution"]);
const DISPLAY_CONFIDENCE_LEVELS = new Set([
  "high",
  "medium",
  "low",
  "needs_resolution",
  "High confidence",
  "Medium confidence",
  "Needs resolution"
]);
const PROJECT_TYPES = new Set(["single_task", "multi_component_system"]);
const CONSEQUENCE_VERDICTS = new Set(["ok", "warn", "block", "needs_resolution"]);
const SEVERITIES = new Set(["info", "warn", "block"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pathJoin(path, key) {
  return path ? `${path}.${key}` : key;
}

function requireObject(value, path, errors) {
  if (!isObject(value)) {
    errors.push(`${path || "value"} must be an object.`);
    return false;
  }
  return true;
}

function requireString(value, path, errors, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    errors.push(`${path} must be a non-empty string.`);
  }
}

function requireNumber(value, path, errors) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${path} must be a finite number.`);
  }
}

function requireInteger(value, path, errors) {
  if (!Number.isInteger(value)) {
    errors.push(`${path} must be an integer.`);
  }
}

function requireBoolean(value, path, errors) {
  if (typeof value !== "boolean") {
    errors.push(`${path} must be a boolean.`);
  }
}

function requireArray(value, path, errors, itemValidator = null) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  if (itemValidator) {
    value.forEach((item, index) => itemValidator(item, `${path}[${index}]`, errors));
  }
}

function requireStringArray(value, path, errors) {
  requireArray(value, path, errors, (item, itemPath, itemErrors) => requireString(item, itemPath, itemErrors));
}

function requireEnum(value, allowed, path, errors) {
  if (!allowed.has(value)) {
    errors.push(`${path} must be one of: ${Array.from(allowed).join(", ")}.`);
  }
}

function validateWarning(value, path, errors) {
  if (!requireObject(value, path, errors)) return;
  requireString(value.column, pathJoin(path, "column"), errors);
  requireEnum(value.severity, SEVERITIES, pathJoin(path, "severity"), errors);
  requireString(value.reason, pathJoin(path, "reason"), errors);
}

function validateColumnProfile(value, path, errors) {
  if (!requireObject(value, path, errors)) return;
  requireString(value.name, pathJoin(path, "name"), errors);
  requireInteger(value.index, pathJoin(path, "index"), errors);
  requireString(value.kind, pathJoin(path, "kind"), errors);
  requireInteger(value.missing_count, pathJoin(path, "missing_count"), errors);
  requireNumber(value.missing_ratio, pathJoin(path, "missing_ratio"), errors);
  requireInteger(value.unique_count, pathJoin(path, "unique_count"), errors);
  requireNumber(value.unique_ratio, pathJoin(path, "unique_ratio"), errors);
  requireInteger(value.non_missing_count, pathJoin(path, "non_missing_count"), errors);
  requireStringArray(value.sample_values, pathJoin(path, "sample_values"), errors);
}

function validateExecutableCheck(value, path, errors) {
  if (!requireObject(value, path, errors)) return;
  requireString(value.kind, pathJoin(path, "kind"), errors);
  requireString(value.executable_consequence, pathJoin(path, "executable_consequence"), errors);
}

export function validateDatasetProfileContract(profile) {
  const errors = [];
  if (!requireObject(profile, "dataset_profile", errors)) return { ok: false, errors };

  requireString(profile.filename, "dataset_profile.filename", errors);
  requireString(profile.delimiter, "dataset_profile.delimiter", errors, { allowEmpty: true });
  requireInteger(profile.row_count, "dataset_profile.row_count", errors);
  requireInteger(profile.column_count, "dataset_profile.column_count", errors);
  requireArray(profile.columns, "dataset_profile.columns", errors, validateColumnProfile);

  if (requireObject(profile.inferred, "dataset_profile.inferred", errors)) {
    if (profile.inferred.target !== null) {
      requireString(profile.inferred.target, "dataset_profile.inferred.target", errors);
    }
    requireEnum(profile.inferred.task_type, TASK_TYPES, "dataset_profile.inferred.task_type", errors);
    requireStringArray(profile.inferred.id_columns, "dataset_profile.inferred.id_columns", errors);
    requireStringArray(profile.inferred.date_columns, "dataset_profile.inferred.date_columns", errors);
    requireStringArray(profile.inferred.numeric_features, "dataset_profile.inferred.numeric_features", errors);
    requireStringArray(profile.inferred.categorical_features, "dataset_profile.inferred.categorical_features", errors);
    requireStringArray(profile.inferred.text_features, "dataset_profile.inferred.text_features", errors);
    requireStringArray(profile.inferred.excluded_features, "dataset_profile.inferred.excluded_features", errors);
  }

  requireArray(profile.executable_checks, "dataset_profile.executable_checks", errors, validateExecutableCheck);
  requireArray(profile.target_candidates, "dataset_profile.target_candidates", errors, (item, path, itemErrors) => {
    if (!requireObject(item, path, itemErrors)) return;
    requireString(item.name, pathJoin(path, "name"), itemErrors);
    requireNumber(item.score, pathJoin(path, "score"), itemErrors);
  });
  requireArray(profile.leakage_warnings, "dataset_profile.leakage_warnings", errors, validateWarning);
  requireArray(profile.quality_warnings, "dataset_profile.quality_warnings", errors, validateWarning);

  return { ok: errors.length === 0, errors };
}

function validateInputConstraint(value, path, errors) {
  if (!requireObject(value, path, errors)) return;
  requireString(value.field, pathJoin(path, "field"), errors);
  requireString(value.kind, pathJoin(path, "kind"), errors);
  requireString(value.rule, pathJoin(path, "rule"), errors);
  requireBoolean(value.nullable, pathJoin(path, "nullable"), errors);
}

function validateDecision(value, path, errors) {
  if (!requireObject(value, path, errors)) return;
  requireEnum(value.task_type, TASK_TYPES, pathJoin(path, "task_type"), errors);
  requireString(value.objective, pathJoin(path, "objective"), errors);
  requireString(value.primary_metric, pathJoin(path, "primary_metric"), errors);
  requireString(value.split_strategy, pathJoin(path, "split_strategy"), errors);
  requireStringArray(value.features, pathJoin(path, "features"), errors);
  if (value.target !== null && value.target !== undefined) {
    requireString(value.target, pathJoin(path, "target"), errors);
  }
  requireEnum(value.confidence, CONFIDENCE_LEVELS, pathJoin(path, "confidence"), errors);
  if (value.requires_input_validation !== undefined) {
    requireBoolean(value.requires_input_validation, pathJoin(path, "requires_input_validation"), errors);
  }
  if (value.input_constraints !== undefined) {
    requireArray(value.input_constraints, pathJoin(path, "input_constraints"), errors, validateInputConstraint);
  }
}

function validateKnowledgeEntry(value, path, errors) {
  if (!requireObject(value, path, errors)) return;
  requireString(value.id, pathJoin(path, "id"), errors);
  requireString(value.type, pathJoin(path, "type"), errors);
  requireString(value.title, pathJoin(path, "title"), errors);
  requireString(value.summary, pathJoin(path, "summary"), errors);
}

function validateConsequence(value, path, errors) {
  if (!requireObject(value, path, errors)) return;
  requireString(value.id, pathJoin(path, "id"), errors);
  requireEnum(value.severity, SEVERITIES, pathJoin(path, "severity"), errors);
  requireBoolean(value.fired, pathJoin(path, "fired"), errors);
  requireString(value.message, pathJoin(path, "message"), errors);
  if (!isObject(value.computed)) {
    errors.push(`${pathJoin(path, "computed")} must be an object.`);
  }
  requireStringArray(value.questions, pathJoin(path, "questions"), errors);
}

function validateConsequenceSummary(value, path, errors) {
  if (!requireObject(value, path, errors)) return;
  requireEnum(value.verdict, CONSEQUENCE_VERDICTS, pathJoin(path, "verdict"), errors);
  requireArray(value.blocking, pathJoin(path, "blocking"), errors, validateConsequence);
  requireArray(value.all, pathJoin(path, "all"), errors, validateConsequence);
}

function validateComponent(value, path, errors) {
  if (!requireObject(value, path, errors)) return;
  requireString(value.id, pathJoin(path, "id"), errors);
  requireString(value.name, pathJoin(path, "name"), errors);
  requireEnum(value.task_type, TASK_TYPES, pathJoin(path, "task_type"), errors);
}

export function validateBlueprintContract(blueprint) {
  const errors = [];
  if (!requireObject(blueprint, "blueprint", errors)) return { ok: false, errors };

  requireString(blueprint.title, "blueprint.title", errors);
  requireString(blueprint.engine_name, "blueprint.engine_name", errors);
  requireEnum(blueprint.project_type, PROJECT_TYPES, "blueprint.project_type", errors);
  requireEnum(blueprint.task_type, TASK_TYPES, "blueprint.task_type", errors);
  requireString(blueprint.audience, "blueprint.audience", errors);
  requireEnum(blueprint.confidence, DISPLAY_CONFIDENCE_LEVELS, "blueprint.confidence", errors);
  requireObject(blueprint.summary, "blueprint.summary", errors);
  requireStringArray(blueprint.data_contract, "blueprint.data_contract", errors);
  requireStringArray(blueprint.model_path, "blueprint.model_path", errors);
  validateDecision(blueprint.decision, "blueprint.decision", errors);
  requireStringArray(blueprint.decision_trace, "blueprint.decision_trace", errors);
  validateConsequenceSummary(blueprint.consequences, "blueprint.consequences", errors);
  if (blueprint.component_consequences !== null && blueprint.component_consequences !== undefined) {
    validateConsequenceSummary(blueprint.component_consequences, "blueprint.component_consequences", errors);
  }
  requireArray(blueprint.components, "blueprint.components", errors, validateComponent);
  requireArray(blueprint.retrieved_knowledge, "blueprint.retrieved_knowledge", errors, validateKnowledgeEntry);

  if (blueprint.dataset_profile !== null && blueprint.dataset_profile !== undefined) {
    const profileResult = validateDatasetProfileContract(blueprint.dataset_profile);
    errors.push(...profileResult.errors.map((error) => error.replace(/^dataset_profile/, "blueprint.dataset_profile")));
  }

  if (requireObject(blueprint.agent_spec, "blueprint.agent_spec", errors)) {
    requireString(blueprint.agent_spec.product, "blueprint.agent_spec.product", errors);
    requireString(blueprint.agent_spec.engine_name, "blueprint.agent_spec.engine_name", errors);
    requireEnum(blueprint.agent_spec.task_type, TASK_TYPES, "blueprint.agent_spec.task_type", errors);
    validateDecision(blueprint.agent_spec.decision, "blueprint.agent_spec.decision", errors);
    requireStringArray(blueprint.agent_spec.acceptance_criteria, "blueprint.agent_spec.acceptance_criteria", errors);
  }

  return { ok: errors.length === 0, errors };
}

export function assertContract(result, label = "MILLE contract") {
  if (!result.ok) {
    throw new Error(`${label} failed:\n${result.errors.map((error) => `- ${error}`).join("\n")}`);
  }
}
