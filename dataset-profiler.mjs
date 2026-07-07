const MISSING = new Set(["", "na", "n/a", "null", "none", "nan", "undefined", "-"]);
const TARGET_HINTS = [
  "target",
  "label",
  "class",
  "churn",
  "cancel",
  "default",
  "fraud",
  "readmit",
  "readmitted",
  "readmission",
  "price",
  "revenue",
  "sales",
  "demand",
  "units",
  "quantity",
  "qty",
  "sold",
  "volume",
  "rating",
  "score"
];
const DATE_HINTS = ["date", "time", "timestamp", "created", "updated", "week", "month", "day"];
const ID_HINTS = ["id", "uuid", "guid", "key"];
const LEAKAGE_HINTS = ["future", "post", "after", "outcome", "result", "label", "target", "leak"];
const ENTITY_HINTS = [
  "account",
  "applicant",
  "borrower",
  "buyer",
  "card",
  "client",
  "company",
  "customer",
  "device",
  "household",
  "merchant",
  "member",
  "organization",
  "org",
  "patient",
  "seller",
  "store",
  "tenant",
  "user"
];
const PII_NAME_PATTERNS = [
  /\bemail\b/,
  /\be_?mail\b/,
  /\bphone\b/,
  /\bmobile\b/,
  /\bssn\b/,
  /\bsocial_?security\b/,
  /\bfull_?name\b/,
  /\bfirst_?name\b/,
  /\blast_?name\b/,
  /\baddress\b/,
  /\bip_?address\b/
];
const PROTECTED_NAME_PATTERNS = [
  /\bage\b/,
  /\bdate_?of_?birth\b/,
  /\bdob\b/,
  /\brace\b/,
  /\bethnicity\b/,
  /\bgender\b/,
  /\bsex\b/,
  /\breligion\b/,
  /\bdisability\b/,
  /\bmarital_?status\b/,
  /\bnationality\b/,
  /\bcitizenship\b/,
  /\bveteran_?status\b/
];
const PROXY_NAME_PATTERNS = [
  /\bzip\b/,
  /\bzip_?code\b/,
  /\bpostal_?code\b/,
  /\bpostcode\b/,
  /\bcensus_?tract\b/,
  /\bneighbou?rhood\b/,
  /\bgeo_?hash\b/
];
const TINY_SAMPLE_ROWS = 30;
const LOW_SAMPLE_ROWS = 100;

function parseCsvLine(line, delimiter) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseCsv(csvText) {
  const text = String(csvText || "");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) {
    throw new Error("Input does not look like delimited text; binary/control-character data cannot be profiled as CSV.");
  }
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    throw new Error("CSV needs a header row and at least one data row.");
  }

  const commaCount = (lines[0].match(/,/g) || []).length;
  const semicolonCount = (lines[0].match(/;/g) || []).length;
  const tabCount = (lines[0].match(/\t/g) || []).length;
  const delimiter = tabCount > commaCount && tabCount > semicolonCount ? "\t" : semicolonCount > commaCount ? ";" : ",";
  const headers = parseCsvLine(lines[0], delimiter).map((header, index) => header || `column_${index + 1}`);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line, delimiter);
    return headers.map((header, index) => [header, values[index] ?? ""]);
  });

  return { delimiter, headers, rows };
}

function isMissing(value) {
  return MISSING.has(String(value || "").trim().toLowerCase());
}

function isNumeric(value) {
  if (isMissing(value)) return false;
  return /^[-+]?(\d+|\d*\.\d+)(e[-+]?\d+)?$/i.test(String(value).trim());
}

function isBoolean(value) {
  if (isMissing(value)) return false;
  return /^(true|false|yes|no|0|1)$/i.test(String(value).trim());
}

function isDate(value) {
  if (isMissing(value) || isNumeric(value)) return false;
  const parsed = Date.parse(String(value).trim());
  return Number.isFinite(parsed);
}

function valueCounts(values) {
  const counts = new Map();
  for (const value of values) {
    if (isMissing(value)) continue;
    const key = String(value).trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function distributionStats(values, rowCount) {
  const counts = valueCounts(values);
  const presentCount = Array.from(counts.values()).reduce((total, count) => total + count, 0);
  const countValues = Array.from(counts.values());
  const dominantValueCount = countValues.length ? Math.max(...countValues) : 0;
  const repeatedValueCount = countValues.filter((count) => count > 1).length;
  const repeatedRowCount = countValues.filter((count) => count > 1).reduce((total, count) => total + count, 0);
  return {
    dominant_value_count: dominantValueCount,
    dominant_value_ratio: presentCount === 0 ? 0 : roundMetric(dominantValueCount / presentCount),
    repeated_value_count: repeatedValueCount,
    repeated_row_count: repeatedRowCount,
    repeated_row_ratio: rowCount === 0 ? 0 : roundMetric(repeatedRowCount / rowCount)
  };
}

function dateStats(values) {
  const timestamps = values
    .filter((value) => !isMissing(value) && isDate(value))
    .map((value) => Date.parse(String(value).trim()))
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return {};
  return {
    date_min: new Date(Math.min(...timestamps)).toISOString(),
    date_max: new Date(Math.max(...timestamps)).toISOString()
  };
}

function numericStats(values) {
  const numericValues = values
    .filter((value) => !isMissing(value) && isNumeric(value))
    .map((value) => Number(String(value).trim()))
    .filter((value) => Number.isFinite(value));
  if (!numericValues.length) return {};
  const integerCount = numericValues.filter((value) => Number.isInteger(value)).length;
  const nonNegativeCount = numericValues.filter((value) => value >= 0).length;
  return {
    numeric_min: Math.min(...numericValues),
    numeric_max: Math.max(...numericValues),
    numeric_integer_ratio: Number((integerCount / numericValues.length).toFixed(4)),
    numeric_nonnegative_ratio: Number((nonNegativeCount / numericValues.length).toFixed(4))
  };
}

function columnKind(name, values, rowCount) {
  const lower = name.toLowerCase();
  const present = values.filter((value) => !isMissing(value));
  const unique = new Set(present.map((value) => String(value).trim()));
  const uniqueRatio = rowCount === 0 ? 0 : unique.size / rowCount;
  const numericRatio = present.length === 0 ? 0 : present.filter(isNumeric).length / present.length;
  const dateRatio = present.length === 0 ? 0 : present.filter(isDate).length / present.length;
  const booleanRatio = present.length === 0 ? 0 : present.filter(isBoolean).length / present.length;
  const avgLength =
    present.length === 0 ? 0 : present.reduce((total, value) => total + String(value).length, 0) / present.length;

  if (dateRatio >= 0.8 || DATE_HINTS.some((hint) => lower.includes(hint)) && dateRatio >= 0.5) {
    return "date";
  }
  if (ID_HINTS.some((hint) => lower === hint || lower.endsWith(`_${hint}`) || lower.includes(`${hint}_`))) {
    return "id";
  }
  if (booleanRatio >= 0.95) {
    return "boolean";
  }
  if (numericRatio >= 0.9) {
    return "numeric";
  }
  if (uniqueRatio > 0.98) {
    return "id";
  }
  if (avgLength > 80) {
    return "text";
  }
  return "categorical";
}

function targetScore(column, index, columnCount, idea = "") {
  const lower = column.name.toLowerCase();
  const lowerIdea = String(idea || "").toLowerCase();
  let score = index === columnCount - 1 ? 1 : 0;
  for (const hint of TARGET_HINTS) {
    if (lower === hint) score += 6;
    else if (lower.includes(hint)) score += 3;
  }
  if (column.kind === "boolean") score += 2;
  if (column.kind === "categorical" && column.unique_count <= 20) score += 1;
  if (/\b(forecast|demand|sales|units|quantity)\b/.test(lowerIdea) && /(unit|qty|quantity|sold|demand|sales|volume)/.test(lower)) {
    score += 4;
  }
  if (/\b(forecast|demand|sales|units|quantity)\b/.test(lowerIdea) && /price|cost/.test(lower)) {
    score -= 2;
  }
  if (column.kind === "id" || column.kind === "date" || column.missing_ratio > 0.5) score -= 5;
  return score;
}

function recommendTask({ idea = "", columns, target }) {
  const lowerIdea = String(idea || "").toLowerCase();
  const hasDate = columns.some((column) => column.kind === "date");
  const hasUserItem =
    columns.some((column) => /user/i.test(column.name)) && columns.some((column) => /(item|product|sku|content)/i.test(column.name));

  if (/\b(recommend|recommendation|recommender|personalize|ranking)\b/.test(lowerIdea) || hasUserItem) return "recommendation";
  if (/\b(forecast|time series|next \d+|weekly|monthly|demand over time|sales over time)\b/.test(lowerIdea) && hasDate) return "forecasting";
  if (!target) return "clustering";
  if (target.kind === "numeric" && target.unique_count > Math.min(20, Math.max(5, Math.floor(target.non_missing_count * 0.05)))) {
    return hasDate && /forecast|demand|sales|revenue|traffic/i.test(lowerIdea) ? "forecasting" : "regression";
  }
  return "classification";
}

function targetQuantityTerms(targetText = "") {
  const lower = String(targetText || "").toLowerCase();
  const terms = new Set();
  if (/\b(revenue|mrr|arr|sales|income)\b/.test(lower)) {
    ["revenue", "mrr", "arr", "sales", "payments", "payment", "amount", "value", "ltv"].forEach((term) => terms.add(term));
  }
  if (/\b(payment|payments|paid)\b/.test(lower)) {
    ["payments", "payment", "paid", "amount", "value", "revenue"].forEach((term) => terms.add(term));
  }
  if (/\b(value|ltv|lifetime)\b/.test(lower)) {
    ["value", "ltv", "lifetime", "revenue", "payments"].forEach((term) => terms.add(term));
  }
  if (/\b(amount|price|cost)\b/.test(lower)) {
    ["amount", "price", "cost", "value"].forEach((term) => terms.add(term));
  }
  for (const term of ["revenue", "payments", "payment", "value", "ltv", "sales", "amount"]) {
    if (lower.includes(term)) terms.add(term);
  }
  return terms;
}

export function leakageWarnings(columns, targetName, { targetPhrase = "" } = {}) {
  const targetText = `${targetName || ""} ${targetPhrase || ""}`.toLowerCase();
  const quantityText = String(targetName || targetPhrase || "").toLowerCase();
  const targetLabel = targetName || targetPhrase || "outcome";
  const quantityTerms = targetQuantityTerms(quantityText);
  const temporalTarget = /\b(next|future|forecast|after|later|quarter|month|week)\b/.test(targetText);
  const readmissionTarget = /\breadmit|readmission|readmitted_?30d\b/.test(targetText);
  const admissionTimePrediction = /\bat admission|admission time|before discharge|on admission|intake\b/.test(targetText);
  return columns
    .filter((column) => column.name !== targetName)
    .flatMap((column) => {
      const lower = column.name.toLowerCase();
      const warnings = [];
      const aggregate = /(lifetime|total|cumulative|to_?date|sum|ltv|overall)/.test(lower);
      const quantityOverlap = Array.from(quantityTerms).some((term) => lower.includes(term));
      const aggregateRelatedQuantity = quantityTerms.size === 0 || quantityOverlap;

      if (aggregate) {
        const severity = aggregateRelatedQuantity ? "block" : "warn";
        warnings.push({
          column: column.name,
          severity,
          reason: aggregateRelatedQuantity
            ? `${column.name} looks like an aggregate of the target ${targetLabel} and can leak post-outcome information.`
            : `${column.name} has an aggregate-style name; confirm it does not summarize activity that only exists after the outcome (${targetLabel}) occurs.`
        });
        return warnings;
      }

      if (temporalTarget && /(^last_|_date$|_at$|date|timestamp)/.test(lower) && /(last|payment|paid|closed|completed|resolved)/.test(lower)) {
        warnings.push({
          column: column.name,
          severity: "block",
          reason: `${column.name} is a post-outcome timestamp for future target ${targetLabel}.`
        });
        return warnings;
      }

      if (readmissionTarget && /(discharge|length_?of_?stay|los\b|stay_days)/.test(lower)) {
        warnings.push({
          column: column.name,
          severity: admissionTimePrediction ? "block" : "warn",
          reason: `${column.name} is likely unavailable at admission-time readmission scoring and can leak post-admission or discharge information for target ${targetLabel}.`
        });
        return warnings;
      }

      if (quantityOverlap && /\b(current|now|present|mrr|revenue|sales|value|amount)\b/.test(lower.replace(/_/g, " "))) {
        warnings.push({
          column: column.name,
          severity: "warn",
          reason: `${column.name} overlaps with target ${targetLabel}; confirm it is known strictly before the prediction date.`
        });
      }

      if (LEAKAGE_HINTS.some((hint) => lower.includes(hint))) {
        warnings.push({
          column: column.name,
          severity: "warn",
          reason: "Column name suggests future, outcome, target, or post-event information."
        });
      }
      return warnings;
    });
}

function missingnessLeakageWarnings(columns, rows, targetName) {
  if (!targetName) return [];
  const targetPairs = rows
    .map((row) => ({
      target: row.find(([header]) => header === targetName)?.[1],
      row
    }))
    .filter((item) => !isMissing(item.target));
  const targetLabels = new Set(targetPairs.map((item) => String(item.target).trim()));
  if (targetLabels.size < 2 || targetLabels.size > 20) return [];

  return columns
    .filter((column) => column.name !== targetName && column.missing_count > 0 && column.missing_count < rows.length)
    .flatMap((column) => {
      const pairs = targetPairs.map((item) => ({
        missing: isMissing(item.row.find(([header]) => header === column.name)?.[1]),
        target: String(item.target).trim()
      }));
      const byMissing = new Map();
      for (const pair of pairs) {
        if (!byMissing.has(pair.missing)) byMissing.set(pair.missing, new Set());
        byMissing.get(pair.missing).add(pair.target);
      }
      const perfectlySeparates =
        byMissing.size === 2 &&
        Array.from(byMissing.values()).every((labels) => labels.size === 1) &&
        new Set(Array.from(byMissing.values()).map((labels) => Array.from(labels)[0])).size === 2;
      return perfectlySeparates
        ? [
            {
              column: column.name,
              severity: "block",
              reason: `${column.name} missingness perfectly separates target ${targetName}; this can leak post-outcome information.`
            }
          ]
        : [];
    });
}

function normalizeCell(value) {
  return String(value ?? "").trim().toLowerCase();
}

function singleColumnLookupAccuracy(columnValues, targetValues) {
  const pairs = [];
  for (let index = 0; index < columnValues.length; index += 1) {
    const value = normalizeCell(columnValues[index]);
    const target = normalizeCell(targetValues[index]);
    if (isMissing(value) || isMissing(target)) continue;
    pairs.push([value, target]);
  }
  if (pairs.length < 5) return null;

  const groups = new Map();
  for (const [value, target] of pairs) {
    if (!groups.has(value)) groups.set(value, new Map());
    const counts = groups.get(value);
    counts.set(target, (counts.get(target) || 0) + 1);
  }

  let correct = 0;
  for (const counts of groups.values()) {
    correct += Math.max(...counts.values());
  }
  return correct / pairs.length;
}

function majorityBaselineAccuracy(targetValues) {
  const counts = new Map();
  let total = 0;
  for (const value of targetValues) {
    const target = normalizeCell(value);
    if (isMissing(target)) continue;
    counts.set(target, (counts.get(target) || 0) + 1);
    total += 1;
  }
  if (!total) return null;
  return Math.max(...counts.values()) / total;
}

export function valueBasedLeakageWarnings(columns, rows, targetName) {
  if (!targetName) return [];
  const targetValues = rows.map((row) => row.find(([header]) => header === targetName)?.[1] ?? "");
  const distinctTargets = new Set(targetValues.map(normalizeCell).filter((value) => !isMissing(value)));
  if (distinctTargets.size < 2 || distinctTargets.size > 20) return [];

  const baseline = majorityBaselineAccuracy(targetValues);
  if (baseline == null) return [];
  const cardinalityCap = Math.max(2, Math.floor(rows.length * 0.5));

  return columns
    .filter((column) => column.name !== targetName && column.kind !== "id" && column.kind !== "date")
    .filter((column) => column.unique_count <= cardinalityCap)
    .flatMap((column) => {
      const columnValues = rows.map((row) => row.find(([header]) => header === column.name)?.[1] ?? "");
      const accuracy = singleColumnLookupAccuracy(columnValues, targetValues);
      if (accuracy == null) return [];
      const lift = accuracy - baseline;
      const tinySample = rows.length < TINY_SAMPLE_ROWS;
      const sampleNote = tinySample
        ? ` Only ${rows.length} rows were available, so this is a low-confidence statistical signal rather than a standalone blocker.`
        : "";
      if (accuracy >= 0.97 && lift >= 0.1) {
        return [
          {
            column: column.name,
            severity: tinySample ? "warn" : "block",
            reason: `${column.name} alone reproduces ${targetName} with ~${(accuracy * 100).toFixed(1)}% accuracy on this sample (majority baseline ${(baseline * 100).toFixed(1)}%). This is a strong statistical signature of target leakage.${sampleNote}`
          }
        ];
      }
      if (accuracy >= 0.9 && lift >= 0.08) {
        return [
          {
            column: column.name,
            severity: "warn",
            reason: `${column.name} alone predicts ${targetName} with ~${(accuracy * 100).toFixed(1)}% accuracy on this sample (majority baseline ${(baseline * 100).toFixed(1)}%); confirm this value is known before prediction.${sampleNote}`
          }
        ];
      }
      return [];
    });
}

function roundMetric(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function targetValues(rows, targetName) {
  if (!targetName) return [];
  return rows
    .map((row) => {
      const cell = row.find(([header]) => header === targetName);
      return cell ? cell[1] : "";
    })
    .filter((value) => !isMissing(value));
}

function classDistribution(values) {
  const counts = new Map();
  for (const value of values) {
    const key = String(value).trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      ratio: roundMetric(count / values.length)
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function classificationExecutableChecks(values) {
  if (values.length === 0) return null;
  const distribution = classDistribution(values);
  const majority = distribution[0];
  const minority = distribution[distribution.length - 1];
  const recallByClass = Object.fromEntries(
    distribution.map((item) => [item.label, item.label === majority.label ? 1 : 0])
  );
  const macroRecall = distribution.reduce((total, item) => total + recallByClass[item.label], 0) / distribution.length;
  const majorityAccuracy = majority.count / values.length;
  const warning =
    majorityAccuracy >= 0.8 && distribution.length > 1
      ? `Accuracy is unsafe as a primary metric: a majority-class predictor reaches ${roundMetric(majorityAccuracy)} accuracy while minority-class recall is 0.`
      : "Compare candidate models against this majority-class baseline before accepting accuracy claims.";

  return {
    kind: "classification_majority_baseline",
    evaluated_rows: values.length,
    class_distribution: distribution,
    majority_class: majority.label,
    minority_class: minority.label,
    majority_accuracy: roundMetric(majorityAccuracy),
    recall_by_class: recallByClass,
    minority_recall: distribution.length > 1 && minority.label !== majority.label ? 0 : 1,
    macro_recall: roundMetric(macroRecall),
    executable_consequence: warning
  };
}

export function claimedClassificationCheck(claims = {}) {
  if (claims.positive_rate == null || !Number.isFinite(claims.positive_rate)) return null;
  const positiveRate = Math.min(Math.max(claims.positive_rate, 0), 1);
  const majorityAccuracy = 1 - positiveRate;
  return {
    kind: "classification_majority_baseline_claimed",
    source: "idea_text",
    positive_rate: roundMetric(positiveRate),
    majority_accuracy: roundMetric(majorityAccuracy),
    minority_recall: 0,
    executable_consequence: `Accuracy is unsafe as a primary metric: a majority-class predictor reaches ${roundMetric(majorityAccuracy)} accuracy while minority-class recall is 0.`
  };
}

function numericValues(values) {
  return values.filter(isNumeric).map((value) => Number(value));
}

function regressionExecutableChecks(values) {
  const numbers = numericValues(values);
  if (numbers.length === 0) return null;
  const mean = numbers.reduce((total, value) => total + value, 0) / numbers.length;
  const sorted = [...numbers].sort((left, right) => left - right);
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
  const maeMean = numbers.reduce((total, value) => total + Math.abs(value - mean), 0) / numbers.length;
  const maeMedian = numbers.reduce((total, value) => total + Math.abs(value - median), 0) / numbers.length;
  const rmseMean = Math.sqrt(numbers.reduce((total, value) => total + (value - mean) ** 2, 0) / numbers.length);
  return {
    kind: "regression_constant_baselines",
    evaluated_rows: numbers.length,
    mean_prediction: roundMetric(mean),
    median_prediction: roundMetric(median),
    mean_baseline_mae: roundMetric(maeMean),
    median_baseline_mae: roundMetric(maeMedian),
    mean_baseline_rmse: roundMetric(rmseMean),
    executable_consequence:
      "A regression model should beat these constant baselines on the selected evaluation split before being considered useful."
  };
}

function forecastingExecutableChecks(rows, targetName, dateColumns) {
  const dateName = dateColumns?.[0];
  if (!targetName || !dateName) return null;
  const pairs = rows
    .map((row) => {
      const dateValue = row.find(([header]) => header === dateName)?.[1];
      const targetValue = row.find(([header]) => header === targetName)?.[1];
      return {
        date: Date.parse(dateValue),
        value: isNumeric(targetValue) ? Number(targetValue) : null
      };
    })
    .filter((item) => Number.isFinite(item.date) && Number.isFinite(item.value))
    .sort((left, right) => left.date - right.date);
  if (pairs.length < 2) return null;
  const errors = [];
  for (let index = 1; index < pairs.length; index += 1) {
    errors.push(Math.abs(pairs[index].value - pairs[index - 1].value));
  }
  const mae = errors.reduce((total, value) => total + value, 0) / errors.length;
  return {
    kind: "forecasting_naive_previous_value_baseline",
    evaluated_transitions: errors.length,
    date_column: dateName,
    target: targetName,
    naive_previous_value_mae: roundMetric(mae),
    executable_consequence:
      "A forecasting model should beat the previous-value baseline under time-ordered validation before deployment."
  };
}

function executableChecks({ recommendedTask, target, rows, dateColumns }) {
  const values = targetValues(rows, target?.name);
  const checks = [];
  if (recommendedTask === "classification") {
    const check = classificationExecutableChecks(values);
    if (check) checks.push(check);
  }
  if (recommendedTask === "regression") {
    const check = regressionExecutableChecks(values);
    if (check) checks.push(check);
  }
  if (recommendedTask === "forecasting") {
    const check = forecastingExecutableChecks(rows, target?.name, dateColumns);
    if (check) checks.push(check);
    const regressionCheck = regressionExecutableChecks(values);
    if (regressionCheck) checks.push({ ...regressionCheck, kind: "forecasting_constant_target_baselines" });
  }
  return checks;
}

function targetQualityWarnings(target) {
  if (!target) return [];
  if (target.non_missing_count > 0 && target.unique_count <= 1) {
    return [
      {
        column: target.name,
        severity: "block",
        reason: `Target ${target.name} has zero variance; a supervised model cannot learn a useful decision boundary from one observed value.`
      }
    ];
  }
  return [];
}

function normalizedName(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function nameMatches(name, patterns) {
  const normalized = normalizedName(name);
  const spaced = normalized.replace(/_/g, " ");
  return patterns.some((pattern) => pattern.test(normalized) || pattern.test(spaced));
}

function isEntityLikeColumn(column) {
  const lower = normalizedName(column.name);
  const tokens = lower.split("_").filter(Boolean);
  const descriptorToken = tokens[tokens.length - 1] || "";
  const entityDescriptor =
    tokens.length > 1 &&
    ENTITY_HINTS.some((hint) => tokens[0] === hint) &&
    /^(band|category|class|country|flag|group|level|region|risk|score|segment|status|tier|type)$/.test(descriptorToken);
  if (entityDescriptor) return false;
  const idLike = ID_HINTS.some(
    (hint) => lower === hint || lower.endsWith(`_${hint}`) || lower.includes(`${hint}_`)
  );
  const entityLike = ENTITY_HINTS.some(
    (hint) => tokens.includes(hint) || lower.startsWith(`${hint}_`) || lower.endsWith(`_${hint}`)
  );
  return column.kind === "id" || idLike || entityLike;
}

function groupSplitWarnings(columns, targetName) {
  return columns
    .filter((column) => column.name !== targetName)
    .filter((column) => isEntityLikeColumn(column))
    .filter((column) => column.non_missing_count >= 4 && column.unique_count > 1 && column.repeated_row_count > 0)
    .filter((column) => column.unique_count < column.non_missing_count)
    .filter((column) => column.kind === "id" || column.unique_count >= Math.max(2, Math.ceil(column.non_missing_count * 0.2)))
    .map((column) => ({
      column: column.name,
      severity: "block",
      reason: `${column.name} has repeated entity/group values (${column.repeated_row_count}/${column.non_missing_count} rows share repeated values; largest group ${column.dominant_value_count}). A random split can put the same entity in train and test; use GroupKFold or GroupShuffleSplit with ${column.name}.`
    }));
}

function sampleSizeWarnings({ rowCount, columns, target, recommendedTask }) {
  const featureCount = columns.filter((column) => column.name !== target?.name && column.kind !== "id").length;
  const warnings = [];
  if (rowCount < TINY_SAMPLE_ROWS) {
    warnings.push({
      column: "dataset",
      severity: "warn",
      reason: `Only ${rowCount} rows were profiled; leakage heuristics, class balance, and feature statistics are low-confidence on tiny samples.`
    });
  } else if (rowCount < LOW_SAMPLE_ROWS && featureCount > 0 && rowCount < featureCount * 10) {
    warnings.push({
      column: "dataset",
      severity: "warn",
      reason: `${rowCount} rows for ${featureCount} candidate features is a thin sample; validate profiler findings on more data before trusting model quality estimates.`
    });
  }
  if (recommendedTask === "classification" && target && target.non_missing_count > 0 && rowCount < LOW_SAMPLE_ROWS) {
    warnings.push({
      column: target.name,
      severity: "warn",
      reason: `Classification target ${target.name} is profiled on ${target.non_missing_count} rows; class-balance and lookup-leakage checks need a larger validation sample for reliable thresholds.`
    });
  }
  return warnings;
}

function featureVarianceWarnings(columns, targetName) {
  return columns
    .filter((column) => column.name !== targetName && column.non_missing_count > 0)
    .flatMap((column) => {
      if (column.unique_count <= 1) {
        return [
          {
            column: column.name,
            severity: "warn",
            reason: `${column.name} has zero variance across observed rows and will not add predictive signal.`
          }
        ];
      }
      if (column.non_missing_count >= LOW_SAMPLE_ROWS && column.dominant_value_ratio >= 0.98) {
        return [
          {
            column: column.name,
            severity: "warn",
            reason: `${column.name} is near-zero variance: the most common value covers ${(column.dominant_value_ratio * 100).toFixed(1)}% of non-missing rows.`
          }
        ];
      }
      return [];
    });
}

function highCardinalityWarnings(columns, targetName, rowCount) {
  return columns
    .filter((column) => column.name !== targetName && column.kind === "categorical")
    .filter((column) => column.unique_count >= 50 && column.unique_ratio >= 0.2)
    .map((column) => ({
      column: column.name,
      severity: "warn",
      reason: `${column.name} has ${column.unique_count} distinct categories across ${rowCount} rows; one-hot encoding may explode dimensionality, so consider frequency, target, or hashing encoders.`
    }));
}

function piiValueEvidence(values) {
  let email = 0;
  let phone = 0;
  let ssn = 0;
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) email += 1;
    if (/^\+?[0-9][0-9 .()/-]{7,}[0-9]$/.test(text)) phone += 1;
    if (/^\d{3}-?\d{2}-?\d{4}$/.test(text)) ssn += 1;
  }
  if (email > 0) return "email-shaped values";
  if (ssn > 0) return "SSN-shaped values";
  if (phone > 0) return "phone-number-shaped values";
  return "";
}

function sensitiveAttributeWarnings(columns, rows) {
  return columns.flatMap((column) => {
    const values = rows.map((row) => row.find(([header]) => header === column.name)?.[1] ?? "");
    const warnings = [];
    const piiEvidence = nameMatches(column.name, PII_NAME_PATTERNS)
      ? "PII-shaped column name"
      : column.kind === "date"
        ? ""
        : piiValueEvidence(values);
    if (piiEvidence) {
      warnings.push({
        column: column.name,
        severity: "warn",
        reason: `${column.name} looks like direct PII (${piiEvidence}); confirm retention, masking, and model-input legality before using it.`
      });
    }
    if (nameMatches(column.name, PROTECTED_NAME_PATTERNS)) {
      warnings.push({
        column: column.name,
        severity: "warn",
        reason: `${column.name} looks like a protected or sensitive attribute; confirm fairness, anti-discrimination, and regulatory treatment before using it as a feature.`
      });
    }
    if (nameMatches(column.name, PROXY_NAME_PATTERNS)) {
      warnings.push({
        column: column.name,
        severity: "warn",
        reason: `${column.name} can act as a protected-attribute proxy; document compliance approval before using it in model inputs.`
      });
    }
    return warnings;
  });
}

function rowValue(row, header) {
  return row.find(([candidate]) => candidate === header)?.[1] ?? "";
}

function rowFingerprint(row, headers) {
  return JSON.stringify(headers.map((header) => normalizeCell(rowValue(row, header))));
}

function overlapProfile({ trainHeaders, trainRows, holdoutCsvText, holdoutFilename, targetName }) {
  if (!holdoutCsvText) return null;
  const holdout = parseCsv(holdoutCsvText);
  const holdoutHeaderSet = new Set(holdout.headers);
  const commonHeaders = trainHeaders.filter((header) => holdoutHeaderSet.has(header));
  const featureHeaders = commonHeaders.filter((header) => header !== targetName);
  if (!commonHeaders.length) {
    return {
      holdout_filename: holdoutFilename,
      holdout_row_count: holdout.rows.length,
      compared_columns: [],
      feature_columns_compared: [],
      exact_duplicate_rows: 0,
      exact_duplicate_ratio: 0,
      feature_duplicate_rows: 0,
      feature_duplicate_ratio: 0
    };
  }
  const trainExact = new Set(trainRows.map((row) => rowFingerprint(row, commonHeaders)));
  const trainFeatures = featureHeaders.length
    ? new Set(trainRows.map((row) => rowFingerprint(row, featureHeaders)))
    : new Set();
  const exactDuplicateRows = holdout.rows.filter((row) => trainExact.has(rowFingerprint(row, commonHeaders))).length;
  const featureDuplicateRows = featureHeaders.length
    ? holdout.rows.filter((row) => trainFeatures.has(rowFingerprint(row, featureHeaders))).length
    : 0;
  return {
    holdout_filename: holdoutFilename,
    holdout_row_count: holdout.rows.length,
    compared_columns: commonHeaders,
    feature_columns_compared: featureHeaders,
    exact_duplicate_rows: exactDuplicateRows,
    exact_duplicate_ratio: holdout.rows.length === 0 ? 0 : roundMetric(exactDuplicateRows / holdout.rows.length),
    feature_duplicate_rows: featureDuplicateRows,
    feature_duplicate_ratio: holdout.rows.length === 0 ? 0 : roundMetric(featureDuplicateRows / holdout.rows.length)
  };
}

function overlapWarnings(overlap) {
  if (!overlap) return [];
  const warnings = [];
  if (overlap.exact_duplicate_rows > 0) {
    warnings.push({
      column: "train_test_overlap",
      severity: "block",
      reason: `${overlap.exact_duplicate_rows} holdout row(s) are exact duplicates of training rows across shared columns; this invalidates holdout evaluation.`
    });
  }
  if (overlap.feature_duplicate_rows > overlap.exact_duplicate_rows) {
    warnings.push({
      column: "train_test_overlap",
      severity: "block",
      reason: `${overlap.feature_duplicate_rows} holdout row(s) duplicate training feature values across shared non-target columns; check for row/entity leakage across the train-test boundary.`
    });
  }
  return warnings;
}

export function analyzeDataset({
  csvText,
  filename = "uploaded.csv",
  idea = "",
  holdoutCsvText = null,
  holdoutFilename = "holdout.csv"
} = {}) {
  const { delimiter, headers, rows } = parseCsv(csvText);
  const rowCount = rows.length;
  const columns = headers.map((header, index) => {
    const values = rows.map((row) => row[index][1]);
    const present = values.filter((value) => !isMissing(value));
    const uniqueValues = Array.from(new Set(present.map((value) => String(value).trim())));
    const kind = columnKind(header, values, rowCount);
    return {
      name: header,
      index,
      kind,
      ...numericStats(values),
      ...dateStats(values),
      ...distributionStats(values, rowCount),
      missing_count: rowCount - present.length,
      missing_ratio: rowCount === 0 ? 0 : Number(((rowCount - present.length) / rowCount).toFixed(4)),
      unique_count: uniqueValues.length,
      unique_ratio: rowCount === 0 ? 0 : Number((uniqueValues.length / rowCount).toFixed(4)),
      non_missing_count: present.length,
      sample_values: uniqueValues.slice(0, 5)
    };
  });

  const targetCandidates = columns
    .map((column, index) => ({
      name: column.name,
      kind: column.kind,
      score: targetScore(column, index, columns.length, idea),
      reason:
        TARGET_HINTS.find((hint) => column.name.toLowerCase().includes(hint)) ||
        (index === columns.length - 1 ? "last column" : "low-cardinality/typed target candidate")
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const target = targetCandidates[0] ? columns.find((column) => column.name === targetCandidates[0].name) : null;
  const recommendedTask = recommendTask({ idea, columns, target });
  const featureColumns = columns.filter((column) => column.name !== target?.name && column.kind !== "id");
  const dateColumns = columns.filter((column) => column.kind === "date").map((column) => column.name);
  const splitWarnings = groupSplitWarnings(columns, target?.name);
  const groupColumns = splitWarnings.map((warning) => warning.column);
  const groupColumnSet = new Set(groupColumns);
  const modelingFeatureColumns = featureColumns.filter((column) => !groupColumnSet.has(column.name));
  const holdoutOverlap = overlapProfile({
    trainHeaders: headers,
    trainRows: rows,
    holdoutCsvText,
    holdoutFilename,
    targetName: target?.name
  });
  const checks = executableChecks({ recommendedTask, target, rows, dateColumns });
  const executableWarnings = checks
    .filter((check) => check.executable_consequence)
    .map((check) => ({
      column: target?.name || "dataset",
      severity: "warn",
      reason: check.executable_consequence
    }));

  const leakage = leakageWarnings(columns, target?.name, { targetPhrase: idea })
    .concat(missingnessLeakageWarnings(columns, rows, target?.name))
    .concat(valueBasedLeakageWarnings(columns, rows, target?.name));
  const qualityWarnings = columns
    .filter((column) => column.missing_ratio > 0.4)
    .map((column) => ({
      column: column.name,
      severity: "warn",
      reason: `High missing ratio: ${(column.missing_ratio * 100).toFixed(1)}%.`
    }))
    .concat(
      targetQualityWarnings(target),
      sampleSizeWarnings({ rowCount, columns, target, recommendedTask }),
      featureVarianceWarnings(columns, target?.name),
      highCardinalityWarnings(columns, target?.name, rowCount),
      sensitiveAttributeWarnings(columns, rows),
      overlapWarnings(holdoutOverlap),
      executableWarnings
    );

  return {
    filename,
    delimiter,
    row_count: rowCount,
    column_count: headers.length,
    columns,
    inferred: {
      target: target ? target.name : null,
      task_type: recommendedTask,
      id_columns: columns.filter((column) => column.kind === "id").map((column) => column.name),
      date_columns: dateColumns,
      numeric_features: modelingFeatureColumns.filter((column) => column.kind === "numeric").map((column) => column.name),
      categorical_features: modelingFeatureColumns
        .filter((column) => ["categorical", "boolean"].includes(column.kind))
        .map((column) => column.name),
      text_features: modelingFeatureColumns.filter((column) => column.kind === "text").map((column) => column.name),
      excluded_features: Array.from(
        new Set([...columns.filter((column) => column.kind === "id").map((column) => column.name), ...groupColumns])
      ),
      group_columns: groupColumns
    },
    executable_checks: checks,
    target_candidates: targetCandidates,
    leakage_warnings: leakage,
    quality_warnings: qualityWarnings,
    split_warnings: splitWarnings,
    holdout_overlap: holdoutOverlap,
    analysis_confidence: rowCount < TINY_SAMPLE_ROWS ? "low" : rowCount < LOW_SAMPLE_ROWS ? "medium" : "high"
  };
}
