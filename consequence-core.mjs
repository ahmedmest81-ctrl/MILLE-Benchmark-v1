import { claimedClassificationCheck, leakageWarnings } from "./dataset-profiler.mjs";

function cloneDecision(draft = {}) {
  return {
    task_type: draft.task_type || "classification",
    objective: draft.objective || "cross_entropy",
    primary_metric: draft.primary_metric || "ROC-AUC",
    split_strategy: draft.split_strategy || "random",
    features: Array.isArray(draft.features) ? [...draft.features] : [],
    target: draft.target || null,
    confidence: draft.confidence || "high",
    requires_input_validation: Boolean(draft.requires_input_validation),
    input_constraints: Array.isArray(draft.input_constraints) ? [...draft.input_constraints] : [],
    input_validation_asserted: Boolean(draft.input_validation_asserted || draft.validation_asserted),
    gate_resolution: draft.gate_resolution || null
  };
}

function percentText(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return `${Number((value * 100).toFixed(4))}%`;
}

function pushQuestion(questions, text) {
  if (!questions.includes(text)) questions.push(text);
}

function result({
  id,
  severity = "warn",
  fired = false,
  message,
  computed = {},
  remedy = "",
  questions = [],
  resolution_status = fired ? "open" : "not_applicable",
  resolution_note = ""
}) {
  return { id, severity, fired, message, computed, remedy, questions, resolution_status, resolution_note };
}

function cleanNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanNonNegativeNumber(value, invalidAnswers, key) {
  const number = cleanNumber(value);
  if (number == null) return null;
  if (number < 0) {
    invalidAnswers[key] = "must be a non-negative number";
    return null;
  }
  return number;
}

function cleanRecall(value, invalidAnswers) {
  const number = cleanNumber(value);
  if (number == null) return null;
  if (number <= 0 || number > 1) {
    invalidAnswers.minimum_recall = "must be greater than 0 and less than or equal to 1";
    return null;
  }
  return number;
}

function cleanDate(value, invalidAnswers) {
  if (typeof value !== "string" || !value.trim()) return "";
  const text = value.trim();
  const parsed = Date.parse(text);
  if (!/^\d{4}-\d{2}-\d{2}(?:$|[tT\s])/.test(text) || !Number.isFinite(parsed)) {
    invalidAnswers.cutoff_date = "must be a valid ISO-like date such as 2026-03-01";
    return "";
  }
  return text;
}

function cleanGateAnswers(gateAnswers = {}) {
  const answers = gateAnswers && typeof gateAnswers === "object" ? gateAnswers : {};
  const invalidAnswers = {};
  return {
    false_negative_cost: cleanNonNegativeNumber(answers.false_negative_cost, invalidAnswers, "false_negative_cost"),
    false_positive_cost: cleanNonNegativeNumber(answers.false_positive_cost, invalidAnswers, "false_positive_cost"),
    minimum_recall: cleanRecall(answers.minimum_recall, invalidAnswers),
    cutoff_date: cleanDate(answers.cutoff_date, invalidAnswers),
    prediction_horizon: typeof answers.prediction_horizon === "string" ? answers.prediction_horizon.trim() : "",
    input_validation_acknowledged: Boolean(answers.input_validation_acknowledged),
    accepted_gate_ids: Array.isArray(answers.accepted_gate_ids)
      ? answers.accepted_gate_ids.map(String)
      : [],
    invalid_answers: invalidAnswers,
    leakage_field_known_before_prediction:
      answers.leakage_field_known_before_prediction && typeof answers.leakage_field_known_before_prediction === "object"
        ? answers.leakage_field_known_before_prediction
        : {}
  };
}

function hasAcceptedGate(answers, id) {
  return answers.accepted_gate_ids.includes(id);
}

function gateResolution({ status, note = "", answers = {} }) {
  return {
    resolution_status: status,
    resolution_note: note,
    resolution_answers: answers
  };
}

function normalizeLeakageAnswer(value) {
  if (value === false || value === "false" || value === "not_known_before_prediction") return false;
  if (value === true || value === "true" || value === "known_before_prediction") return true;
  return null;
}

function resolveGate(check, answers, decision) {
  if (!check?.fired) return check;

  if (hasAcceptedGate(answers, check.id)) {
    return {
      ...check,
      ...gateResolution({
        status: "accepted",
        note: "A user explicitly accepted this gate as a known implementation risk."
      })
    };
  }

  if (check.id === "metric-validity") {
    const hasCosts = answers.false_negative_cost > 0 && answers.false_positive_cost > 0;
    const hasRecall = answers.minimum_recall != null;
    if (hasCosts && hasRecall) {
      decision.threshold_policy = {
        false_negative_cost: answers.false_negative_cost,
        false_positive_cost: answers.false_positive_cost,
        minimum_recall: answers.minimum_recall
      };
      return {
        ...check,
        ...gateResolution({
          status: "resolved",
          note: "Business costs and minimum recall were supplied, so the metric gate can proceed with threshold tuning.",
          answers: decision.threshold_policy
        })
      };
    }
    return {
      ...check,
      resolution_status: "blocking",
      resolution_note: Object.keys(answers.invalid_answers).length
        ? "Supply non-negative false negative/false positive costs and a minimum recall in (0, 1] to resolve this gate."
        : "Supply false negative cost, false positive cost, and minimum recall to resolve this gate."
    };
  }

  if (check.id === "split-validity") {
    if (answers.cutoff_date || answers.prediction_horizon) {
      decision.split_resolution = {
        cutoff_date: answers.cutoff_date || null,
        prediction_horizon: answers.prediction_horizon || null
      };
      return {
        ...check,
        ...gateResolution({
          status: "resolved",
          note: "A temporal cutoff or prediction horizon was supplied for validation.",
          answers: decision.split_resolution
        })
      };
    }
    return {
      ...check,
      resolution_status: "blocking",
      resolution_note: answers.invalid_answers.cutoff_date
        ? "Supply a valid cutoff date or prediction horizon to resolve this gate."
        : "Supply a cutoff date or prediction horizon to resolve this gate."
    };
  }

  if (check.id === "target-leakage") {
    const columns = check.computed?.blocked_columns || [];
    const answered = columns.map((column) => [
      column,
      normalizeLeakageAnswer(answers.leakage_field_known_before_prediction[column])
    ]);
    const allAnswered = answered.length > 0 && answered.every(([, value]) => value !== null);
    const allExcluded = allAnswered && answered.every(([, value]) => value === false);
    if (allExcluded) {
      decision.feature_availability = {
        excluded_after_user_confirmation: columns
      };
      return {
        ...check,
        ...gateResolution({
          status: "resolved",
          note: "The user confirmed blocked leakage fields are not known before prediction, so exclusion resolves the gate.",
          answers: Object.fromEntries(answered)
        })
      };
    }
    if (allAnswered) {
      return {
        ...check,
        resolution_status: "blocking",
        resolution_note: `At least one blocked field was marked known before prediction; the feature contract must be reviewed before implementation. User assertions: ${Object.entries(Object.fromEntries(answered))
          .map(([column, value]) => `${column}=${value}`)
          .join(", ")}.`,
        resolution_answers: Object.fromEntries(answered)
      };
    }
    return {
      ...check,
      resolution_status: "blocking",
      resolution_note: "Confirm whether each blocked leakage field is known before prediction."
    };
  }

  if (check.id === "data-contract-gate") {
    if (answers.input_validation_acknowledged) {
      decision.input_validation_asserted = true;
      return {
        ...check,
        ...gateResolution({
          status: "resolved",
          note: "The user acknowledged generated input validation as a required implementation artifact.",
          answers: { input_validation_acknowledged: true }
        })
      };
    }
    return {
      ...check,
      resolution_status: check.severity === "block" ? "blocking" : "open",
      resolution_note: "Acknowledge generated runtime validation or accept the risk."
    };
  }

  return check;
}

function hasMlTaskSignal(claims, decision, profile) {
  if (profile?.inferred?.target) return true;
  if (claims.task_guess || claims.target_phrase || claims.resolved_target) return true;
  if ((claims.named_columns || []).some((column) => /(target|label|class|is_|_flag$|_label$)/i.test(column))) return true;
  return /\b(predict|prediction|detect|detection|classify|classification|forecast|forecasting|recommend|recommendation|rank|ranking|segment|cluster|estimate|estimation|score|model|train|optimization|dashboard|route|assign|assignment)\b/i.test(claims.raw || "");
}

function learnabilityGate({ claims, profile, decision }) {
  const raw = String(claims.raw || "");
  const lower = raw.toLowerCase();
  const tokenCount = (lower.match(/[a-z0-9_]+/g) || []).length;
  const irreducibleRandomness = /\b(lottery|dice|roulette|coin toss|winning numbers?)\b/.test(lower);
  const nonMlBuild = /\b(website|login page|landing page|crud app|frontend|web page)\b/.test(lower) && !/\b(predict|classify|forecast|recommend|detect)\b/.test(lower);
  const noConcreteTarget =
    !profile?.inferred?.target &&
    !claims.resolved_target &&
    !claims.target_phrase &&
    (!claims.named_columns || claims.named_columns.length === 0);
  const noTaskSignal = !hasMlTaskSignal(claims, decision, profile);
  const gibberish = tokenCount > 0 && tokenCount <= 5 && noConcreteTarget && noTaskSignal;
  const vague = /\b(make|build)\s+(?:an?\s+)?ai\b/.test(lower) && noConcreteTarget;
  const fired = irreducibleRandomness || nonMlBuild || noTaskSignal || gibberish || vague;

  if (!fired) {
    return result({
      id: "learnability-gate",
      fired: false,
      message: "The request contains enough task and target signal to draft a learnable ML blueprint.",
      computed: {
        target: profile?.inferred?.target || claims.resolved_target || claims.target_phrase || decision.target || null,
        task_signal: true
      }
    });
  }

  decision.confidence = "needs_resolution";
  return result({
    id: "learnability-gate",
    severity: "block",
    fired: true,
    message: "The request does not yet define a learnable ML objective, data target, or feasible prediction problem.",
    computed: {
      target: profile?.inferred?.target || claims.resolved_target || claims.target_phrase || null,
      no_task_signal: noTaskSignal,
      no_concrete_target: noConcreteTarget,
      irreducible_randomness: irreducibleRandomness,
      non_ml_build: nonMlBuild,
      gibberish,
      vague
    },
    remedy: "Define the prediction target, available training examples, and the decision the model will support.",
    questions: ["What exact target should the model predict?", "What historical labeled data is available?", "What decision will use the prediction?"]
  });
}

function csvClassificationCheck(profile) {
  return (profile?.executable_checks || []).find((check) => check.kind === "classification_majority_baseline") || null;
}

function classificationCheck({ claims, profile, decision }) {
  const csvCheck = csvClassificationCheck(profile);
  if (csvCheck) return csvCheck;
  if (decision.task_type !== "classification" && claims.task_guess !== "classification") return null;
  return claimedClassificationCheck(claims);
}

function dateSignals({ claims, profile }) {
  const signals = [];
  for (const column of profile?.inferred?.date_columns || []) signals.push(column);
  for (const column of claims.named_columns || []) {
    if (/(date|time|timestamp|signup|created|_at)\b/.test(column)) signals.push(column);
  }
  if (claims.has_time_language && signals.length === 0) {
    const match = claims.raw.toLowerCase().match(
      /\b(next (?:quarter|month|week|\d+ (?:days|weeks|months))|over time|forecast|real[- ]?time|stream(?:s|ing)?|early warning|monitor(?:ing)?|sensor|vital signs?)\b/
    );
    signals.push(match?.[1] || "time language");
  }
  return Array.from(new Set(signals));
}

export function buildSplitValidityCheck({
  signals = [],
  splitStrategy = "random",
  id = "split-validity",
  context = "the idea/data"
} = {}) {
  const dateSignals = Array.from(new Set((signals || []).filter(Boolean)));
  const fired = dateSignals.length > 0 && splitStrategy === "random";
  if (!fired) {
    return result({
      id,
      fired: false,
      message: `No random split conflict with time structure was detected for ${context}.`,
      computed: {
        date_signals: dateSignals,
        split_strategy: splitStrategy,
        shared_check: "split-validity"
      }
    });
  }

  return result({
    id,
    severity: "block",
    fired: true,
    message: `Random train/test split is invalid for ${context} because it contains time signal(s): ${dateSignals.join(", ")}.`,
    computed: {
      date_signals: dateSignals,
      previous_split: "random",
      shared_check: "split-validity"
    },
    remedy: "Use temporal validation such as a cutoff date, rolling split, or TimeSeriesSplit.",
    questions: ["Cutoff date separating train/test?", "Prediction horizon?"]
  });
}

function isActionableLeakageWarn(warning) {
  const reason = String(warning?.reason || "");
  return /aggregate-style name|alone predicts|Column name suggests/i.test(reason);
}

function profileLeakageCandidates(profile) {
  return (profile?.leakage_warnings || []).filter(
    (warning) => warning.severity === "block" || (warning.severity === "warn" && isActionableLeakageWarn(warning))
  );
}

function claimLeakageBlocks(claims) {
  if (!claims.named_columns?.length) return [];
  const pseudoColumns = claims.named_columns.map((name) => ({ name }));
  return leakageWarnings(pseudoColumns, null, { targetPhrase: claims.target_phrase || claims.raw }).filter(
    (warning) => warning.severity === "block"
  );
}

function metricValidity({ claims, profile, decision }) {
  const check = classificationCheck({ claims, profile, decision });
  const accuracyClaim = claims.stated_objective === "accuracy" || decision.objective === "accuracy";
  const rareClaim = claims.positive_rate != null && claims.positive_rate <= 0.05;
  const severeImbalance = check?.majority_accuracy != null && check.majority_accuracy >= 0.8;
  const fired = Boolean(check && (severeImbalance || (accuracyClaim && rareClaim)));
  if (!fired) {
    return result({
      id: "metric-validity",
      fired: false,
      message: "No severe class-imbalance metric conflict was detected.",
      computed: check || {}
    });
  }

  decision.objective = "cross_entropy";
  decision.primary_metric = "average_precision";
  decision.confidence = "needs_resolution";
  const claimedNumber =
    check.kind === "classification_majority_baseline_claimed" && claims.positive_rate != null
      ? ` The idea states ${percentText(claims.positive_rate)} positive rate`
      : "";
  const objectiveText = claims.stated_objective_raw ? ` and asks for ${claims.stated_objective_raw}.` : ".";
  return result({
    id: "metric-validity",
    severity: "block",
    fired: true,
    message: `${check.executable_consequence}${claimedNumber}${claims.stated_objective_raw ? objectiveText : ""}`,
    computed: check,
    remedy: "Use probability loss with PR-AUC/average precision, recall targets, and threshold tuning instead of accepting accuracy.",
    questions: ["Cost of a missed positive vs a false alarm?", "Minimum acceptable recall?"]
  });
}

function splitValidity({ claims, profile, decision }) {
  const signals = dateSignals({ claims, profile });
  const check = buildSplitValidityCheck({
    signals,
    splitStrategy: decision.split_strategy,
    context: "the idea/data"
  });
  if (!check.fired) return check;

  decision.split_strategy = "temporal";
  decision.confidence = "needs_resolution";
  return check;
}

function targetLeakage({ claims, profile, decision }) {
  const blocks = profile ? profileLeakageCandidates(profile) : claimLeakageBlocks(claims);
  if (!blocks.length) {
    return result({
      id: "target-leakage",
      fired: false,
      message: "No blocking target leakage columns were detected.",
      computed: { blocked_columns: [] }
    });
  }

  const blockedColumns = Array.from(new Set(blocks.map((warning) => warning.column)));
  const blockedSet = new Set(blockedColumns.map((column) => column.toLowerCase()));
  decision.features = decision.features.filter((feature) => !blockedSet.has(String(feature).toLowerCase()));
  decision.confidence = "needs_resolution";
  const target = decision.target || claims.target_phrase || "target";
  const severity = blocks.some((warning) => warning.severity === "block") ? "block" : "warn";
  return result({
    id: "target-leakage",
    severity,
    fired: true,
    message: `Remove leakage column(s) ${blockedColumns.join(", ")} before predicting ${target}.`,
    computed: { blocked_columns: blockedColumns, warnings: blocks },
    remedy: "Drop blocked leakage columns from features and schema, then ask whether any remaining target-like fields are known before prediction time.",
    questions: blockedColumns.map((column) => `Is ${column} known strictly before the prediction date?`)
  });
}

function profileColumn(profile, field) {
  return (profile?.columns || []).find((column) => String(column.name).toLowerCase() === String(field).toLowerCase()) || null;
}

function isIdLike(field, profile) {
  const lower = String(field || "").toLowerCase();
  return /(^id$|_id$|^uuid$|guid)/.test(lower) || (profile?.inferred?.id_columns || []).some((column) => column.toLowerCase() === lower);
}

function isTimestampLike(field, profile) {
  const lower = String(field || "").toLowerCase();
  return (
    /(^timestamp$|_timestamp$|_date$|_at$|date|created|updated|time)/.test(lower) ||
    (profile?.inferred?.date_columns || []).some((column) => column.toLowerCase() === lower)
  );
}

function inferFieldConstraint(field, profile = null) {
  const lower = String(field || "").toLowerCase();
  const column = profileColumn(profile, field);
  const nullable = Boolean(column && column.missing_count > 0);

  if (column) {
    if (column.kind === "id") {
      return { field, kind: "id", rule: "non-empty string", nullable };
    }
    if (column.kind === "date") {
      return { field, kind: "timestamp", rule: "parseable datetime", nullable };
    }
    if (column.kind === "numeric") {
      const min = column.numeric_min;
      const max = column.numeric_max;
      const nonNegative = column.numeric_nonnegative_ratio == null || column.numeric_nonnegative_ratio >= 0.98;
      const integerLike = column.numeric_integer_ratio != null && column.numeric_integer_ratio >= 0.98;
      if (Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max <= 1) {
        return { field, kind: "probability", rule: "0 <= x <= 1", nullable };
      }
      if (integerLike && nonNegative && column.unique_count <= 20 && column.unique_ratio <= 0.2) {
        return { field, kind: "count", rule: "integer x >= 0", nullable };
      }
      return { field, kind: "number", rule: "finite number", nullable };
    }
    if (column.kind === "categorical" || column.kind === "boolean") {
      return { field, kind: "categorical", rule: "non-empty string or known category", nullable };
    }
    if (column.kind === "text") {
      return { field, kind: "text", rule: "non-empty string", nullable };
    }
  }

  if (isIdLike(field, profile)) {
    return { field, kind: "id", rule: "non-empty string", nullable };
  }
  if (isTimestampLike(field, profile)) {
    return { field, kind: "timestamp", rule: "parseable datetime", nullable };
  }
  if (/(_prob|_probability|probability|_risk|risk|_rate|rate)$/.test(lower) || /(^risk_|_risk_)/.test(lower)) {
    return { field, kind: "probability", rule: "0 <= x <= 1", nullable };
  }
  if (/(^amount$|_amount$|price|balance|value|cost)/.test(lower)) {
    return { field, kind: "amount", rule: "x >= 0", nullable };
  }
  if (/(_count$|^num_|_chargebacks$|chargeback_count|age_days$|_days$)/.test(lower)) {
    return { field, kind: "count", rule: "integer x >= 0", nullable };
  }
  if (column?.kind === "numeric" && column.sample_values?.length) {
    const values = column.sample_values.map(Number).filter((value) => Number.isFinite(value));
    if (values.length && values.every((value) => value >= 0 && value <= 1)) {
      return { field, kind: "probability", rule: "0 <= x <= 1", nullable };
    }
  }
  if (column?.kind === "categorical" || column?.kind === "boolean" || (column && column.unique_ratio <= 0.2)) {
    return { field, kind: "categorical", rule: "non-empty string or known category", nullable };
  }
  return { field, kind: "unknown", rule: "type must be asserted", nullable };
}

function dataContractGate({ profile, decision }) {
  if (decision.input_validation_asserted || (decision.requires_input_validation && decision.input_constraints.length)) {
    return result({
      id: "data-contract-gate",
      fired: false,
      message: "Input validation layer is already asserted.",
      computed: { fields: decision.input_constraints || [], unvalidated_count: 0 }
    });
  }

  const targetLower = decision.target ? String(decision.target).toLowerCase() : null;
  const features = Array.from(new Set((decision.features || []).filter(Boolean))).filter(
    (feature) => String(feature).toLowerCase() !== targetLower && !isIdLike(feature, profile)
  );
  const fields = features
    .map((feature) => inferFieldConstraint(feature, profile))
    .filter((field) => field.kind !== "unknown" || /(score|signal|metric|index|ratio)/i.test(field.field));
  const actionable = fields.filter((field) => field.kind !== "id");
  const hardFields = actionable.filter((field) => ["probability", "amount", "timestamp"].includes(field.kind));
  const unknownFields = actionable.filter((field) => field.kind === "unknown");

  if (!actionable.length) {
    return result({
      id: "data-contract-gate",
      fired: false,
      message: "No runtime feature inputs requiring boundary validation were detected.",
      computed: { fields: [], unvalidated_count: 0 }
    });
  }

  decision.input_constraints = actionable;
  decision.requires_input_validation = true;
  if (unknownFields.length) decision.confidence = "needs_resolution";

  const summaries = actionable.map((field) => `${field.field}: ${field.rule}`);
  const questions = unknownFields.map((field) => `Is ${field.field} a probability [0,1], non-negative amount/count, timestamp, category, or another type?`);
  const firedBlock = hardFields.length > 0;

  return result({
    id: "data-contract-gate",
    severity: firedBlock ? "block" : "warn",
    fired: true,
    message: `Inputs ${summaries.join("; ")} are consumed without boundary validation. Reject booleans passed as numbers for probability, amount, and count fields.`,
    computed: {
      fields: actionable,
      unvalidated_count: actionable.length
    },
    remedy: {
      require_validation: true,
      constraints: actionable
    },
    questions
  });
}

export function evaluateBlueprint({ claims = {}, profile = null, draft = {}, gateAnswers = {} } = {}) {
  const decision = cloneDecision(draft);
  const answers = cleanGateAnswers(gateAnswers);
  const checks = [
    learnabilityGate({ claims, profile, decision }),
    metricValidity({ claims, profile, decision }),
    splitValidity({ claims, profile, decision }),
    targetLeakage({ claims, profile, decision }),
    dataContractGate({ claims, profile, decision })
  ].map((check) => resolveGate(check, answers, decision));
  const generatedQuestions = [];
  const blocking = checks.filter(
    (check) =>
      check.fired &&
      check.severity === "block" &&
      !["resolved", "accepted"].includes(check.resolution_status)
  );
  const accepted = checks.filter((check) => check.fired && check.resolution_status === "accepted");
  const resolved = checks.filter((check) => check.fired && check.resolution_status === "resolved");
  const openWarnings = checks.filter(
    (check) =>
      check.fired &&
      check.severity === "warn" &&
      !["resolved", "accepted"].includes(check.resolution_status)
  );
  const unresolvedWarningNeedsResolution = openWarnings.length > 0 && decision.confidence === "needs_resolution";
  if (!blocking.length && !unresolvedWarningNeedsResolution && decision.confidence === "needs_resolution") {
    decision.confidence = accepted.length ? "medium" : "high";
  } else if (accepted.length && decision.confidence === "high") {
    decision.confidence = "medium";
  }
  for (const check of checks.filter(
    (item) =>
      item.fired &&
      !["resolved", "accepted"].includes(item.resolution_status) &&
      (item.severity === "block" || item.questions?.length)
  )) {
    for (const question of check.questions || []) pushQuestion(generatedQuestions, question);
  }
  const knownGateIds = new Set(checks.map((check) => check.id));
  decision.gate_resolution = {
    answers,
    invalid_answers: answers.invalid_answers,
    resolved_gate_ids: resolved.map((check) => check.id),
    accepted_gate_ids: accepted.map((check) => check.id),
    ignored_accepted_gate_ids: answers.accepted_gate_ids.filter((id) => !knownGateIds.has(id)),
    unresolved_gate_ids: blocking.map((check) => check.id)
  };
  return {
    verdict: blocking.length ? "needs_resolution" : accepted.length || unresolvedWarningNeedsResolution ? "warn" : "ok",
    blocking,
    resolved,
    accepted,
    all: checks,
    generated_questions: generatedQuestions,
    decision
  };
}
