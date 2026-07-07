function emptyClaims(raw = "") {
  return {
    raw: String(raw || ""),
    positive_rate: null,
    stated_objective: null,
    stated_objective_raw: null,
    stated_split: null,
    stated_split_raw: null,
    target_phrase: null,
    named_columns: [],
    resolved_target: null,
    resolved_features: [],
    has_time_language: false,
    task_guess: null
  };
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
}

function unique(items) {
  return Array.from(new Set(items.map((item) => item.toLowerCase().trim()).filter(Boolean)));
}

function normalizeColumnToken(token) {
  return token
    .replace(/[`"'().:;]/g, " ")
    .replace(/^(?:a|an|the)\s+/, "")
    .replace(/\s+(?:label|target|flag|column|field|feature)s?$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function plausibleColumnToken(token) {
  if (!token) return false;
  if (/^(a|an|the|and|or|with|for|to|from|predict|use|table|columns?|label|target|flag)$/.test(token)) return false;
  if (/^(project_type|multi_component_system|single_task|decision_trace)$/.test(token)) return false;
  return (
    /^[a-z][a-z0-9_]*$/.test(token) &&
    (token.includes("_") || /^(id|date|time|timestamp|amount|price|revenue|sales|churn|fraud|default|label|target|class)$/i.test(token))
  );
}

function plausibleExplicitColumnToken(token) {
  if (!token) return false;
  if (/^(a|an|the|and|or|with|for|to|from|predict|use|table|columns?|label|target|flag)$/.test(token)) return false;
  if (/^(project_type|multi_component_system|single_task|decision_trace)$/.test(token)) return false;
  return /^[a-z][a-z0-9_]*$/.test(token);
}

function extractNamedColumns(text) {
  const lower = text.toLowerCase();
  const columns = [];
  const tableClause = lower.match(/\b(?:have|has|with|columns?)\b[^.:\n]*(?:columns?|table)\s+(?:has|have|with|including|include|called|named)?\s*([^.\n]+)/);
  const simpleColumns = lower.match(/\bcolumns?\s+(?:are|include|including|called|named)?\s*([^.\n]+)/);
  const source = tableClause?.[1] || simpleColumns?.[1] || "";

  if (source) {
    source
      .split(/,|\band\b/)
      .map(normalizeColumnToken)
      .filter(plausibleExplicitColumnToken)
      .forEach((item) => columns.push(item));
  }

  for (const match of lower.matchAll(/\b(?:table|dataset|data|csv)\s+(?:has|have|contains|includes?|with)\s+([^.\n]+)/g)) {
    match[1]
      .split(/,|\band\b/)
      .map(normalizeColumnToken)
      .filter(plausibleColumnToken)
      .forEach((item) => columns.push(item));
  }

  const withClause = lower.match(/\bwith\s+([^.\n]+?)(?:\.\s|\band\s+\d+(?:\.\d+)?\s*%|$)/);
  if (withClause) {
    withClause[1]
      .split(/,|\band\b/)
      .map(normalizeColumnToken)
      .filter(plausibleColumnToken)
      .forEach((item) => columns.push(item));
  }

  for (const match of text.matchAll(/`([^`]+)`/g)) {
    columns.push(normalizeColumnToken(match[1]));
  }
  for (const match of lower.matchAll(/\b[a-z][a-z0-9]+(?:_[a-z0-9]+)+\b/g)) {
    const token = normalizeColumnToken(match[0]);
    if (plausibleColumnToken(token)) columns.push(token);
  }

  return unique(columns);
}

function isLabelLikeColumn(column, raw = "") {
  const lower = String(column || "").toLowerCase();
  if (/^is_/.test(lower) || /_(label|flag)$/.test(lower)) return true;
  if (/^(target|label|class|churn|churned|fraud|default|defaulted|is_fraud)$/.test(lower)) return true;
  const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(?:a|an)\\s+${escaped}\\s+(?:label|target|flag)\\b`, "i").test(raw);
}

function isIdLikeColumn(column) {
  return /(^id$|_id$|^uuid$|guid|merchant_id|customer_id|user_id|transaction_id)/i.test(column);
}

function nounTokens(text = "") {
  return new Set(
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9_ ]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !/^(the|and|from|with|our|table|predict|detect|classify|next|how|much|use|model)$/.test(token))
  );
}

export function resolveTargetAndFeatures(claims = {}) {
  const namedColumns = claims.named_columns || [];
  const explicitTarget = String(claims.raw || "")
    .toLowerCase()
    .match(/\b(?:target|label|outcome)\s+(?:is|=|:)\s+([a-z][a-z0-9_]+)/)?.[1];
  let target =
    namedColumns.find((column) => explicitTarget && column.toLowerCase() === explicitTarget) ||
    namedColumns.find((column) => isLabelLikeColumn(column, claims.raw));

  if (!target && claims.target_phrase) {
    const targetTokens = nounTokens(claims.target_phrase);
    target = namedColumns.find((column) =>
      column
        .split(/_/)
        .some((part) => targetTokens.has(part) || (part === "mrr" && targetTokens.has("revenue")) || (part === "ltv" && targetTokens.has("value")))
    );
  }

  if (!target && namedColumns.length === 0) {
    target = claims.target_phrase || null;
  }

  const targetLower = target ? target.toLowerCase() : null;
  const features = namedColumns.filter((column) => column.toLowerCase() !== targetLower && !isIdLikeColumn(column));

  return {
    resolved_target: target || null,
    resolved_features: features
  };
}

function extractPositiveRate(lower) {
  const eventNouns = /(fraud|positive|churn|default|cancel|minority|defect|claim|conversion|are\s+[a-z]+)/;
  for (const match of lower.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
    const start = Math.max(0, match.index - 60);
    const end = Math.min(lower.length, match.index + match[0].length + 80);
    const window = lower.slice(start, end);
    if (eventNouns.test(window)) {
      return Number((Number(match[1]) / 100).toFixed(8));
    }
  }
  return null;
}

function extractObjective(lower) {
  const match = firstMatch(lower, [
    /\b(accurate|accuracy)\b/,
    /\b(precision|precise)\b/,
    /\b(recall|catch all|catch most|don'?t miss|do not miss|sensitivity)\b/,
    /\b(minimi[sz]e error|low error)\b/
  ]);
  if (!match) return { stated_objective: null, stated_objective_raw: null };
  const raw = match[1];
  if (/accur/.test(raw)) return { stated_objective: "accuracy", stated_objective_raw: raw };
  if (/precis/.test(raw)) return { stated_objective: "precision", stated_objective_raw: raw };
  if (/recall|catch|miss|sensitivity/.test(raw)) return { stated_objective: "recall", stated_objective_raw: raw };
  return { stated_objective: "error", stated_objective_raw: raw };
}

function extractSplit(lower) {
  const temporal = lower.match(/\b(time.?based|temporal|out.?of.?time|rolling|backtest|by date|chronological)\b/);
  if (temporal) return { stated_split: "temporal", stated_split_raw: temporal[1] };
  const group = lower.match(/\b(by (?:user|group|customer)|grouped)\b/);
  if (group) return { stated_split: "group", stated_split_raw: group[1] };
  const random = lower.match(/\b((?:normal|standard|regular|random|typical)\s+(?:train.?test\s+)?split|train.?test split)\b/);
  if (random) return { stated_split: "random", stated_split_raw: random[1] };
  return { stated_split: null, stated_split_raw: null };
}

function extractTargetAndTask(lower) {
  const explicitTarget = lower.match(/\b(?:target|label|outcome)\s+(?:is|=|:)\s+([a-z][a-z0-9_]+)/);
  if (explicitTarget) {
    return { target_phrase: explicitTarget[1].trim(), task_guess: "classification" };
  }

  const recommendation = lower.match(/\b(recommend|rank)\b(?:\s+\w+){0,6}/);
  if (recommendation) {
    return { target_phrase: recommendation[0].trim(), task_guess: "recommendation" };
  }

  const anomaly = lower.match(/\b(?:detect|find|flag)\s+anomal(?:y|ies)\b|\banomaly detection\b/);
  if (anomaly) {
    const explicitlyUnlabeled = /\b(without|no|unlabeled|unsupervised)\s+(?:incident\s+)?labels?\b|\bwithout incident labels\b/.test(lower);
    return {
      target_phrase: anomaly[0].trim(),
      task_guess: !explicitlyUnlabeled && /\b(labels?|incidents?|outcomes?)\b/.test(lower) ? "classification" : "clustering"
    };
  }

  const forecast = lower.match(/\bforecast\s+([^.;]+?)(?:\s+(?:over time|next\s+\d+|next\s+(?:quarter|month|week)))?(?:[.;]|$)/);
  if (forecast) {
    return { target_phrase: forecast[1].trim(), task_guess: "forecasting" };
  }

  const regression = lower.match(/\bpredict\s+(?:how much\s+)?([^.;]+?)(?:[.;]|$)/);
  if (regression) {
    const phrase = regression[1].trim();
    if (
      /\b(price|revenue|sales|amount|value|ltv|payments?|demand|score|cost|yield|duration|delivery time|arrival time|eta|time to|minutes?|hours?|days?|dollars?|severity|per hectare)\b/.test(phrase) ||
      lower.includes("how much")
    ) {
      return { target_phrase: phrase, task_guess: "regression" };
    }
    return { target_phrase: phrase, task_guess: "classification" };
  }

  const classification = lower.match(/\b(flag|detect|classify)\s+([^.;]+?)(?:[.;]|$)/);
  if (classification) {
    return { target_phrase: classification[2].trim(), task_guess: "classification" };
  }

  if (/\b(fraud|churn|default|cancel)\b/.test(lower)) {
    return { target_phrase: lower.match(/\b(fraud|churn|default|cancel)\b/)?.[1] || null, task_guess: "classification" };
  }

  return { target_phrase: null, task_guess: null };
}

export function parseIdeaClaims(ideaText = "") {
  const claims = emptyClaims(ideaText);
  try {
    const lower = claims.raw.toLowerCase();
    const objective = extractObjective(lower);
    const split = extractSplit(lower);
    const target = extractTargetAndTask(lower);
    const namedColumns = extractNamedColumns(claims.raw);
    const hasNamedDate = namedColumns.some((column) => /(date|time|timestamp|signup|created|_at)\b/.test(column));
    const resolved = resolveTargetAndFeatures({ ...claims, ...target, named_columns: namedColumns });

    return {
      ...claims,
      positive_rate: extractPositiveRate(lower),
      ...objective,
      ...split,
      ...target,
      named_columns: namedColumns,
      ...resolved,
      has_time_language:
        /\b(next (?:quarter|month|week|\d+ (?:days|weeks|months))|within (?:the )?(?:next )?\d+ (?:days?|weeks?|months?|quarters?|years?)|over time|forecast|real[- ]?time|stream(?:s|ing)?|early warning|monitor(?:ing)?|sensor|vital signs?)\b/.test(lower) ||
        hasNamedDate
    };
  } catch {
    return claims;
  }
}
