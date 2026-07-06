# ModelBlueprint Consequence-Core Evaluation

Compared against: `ModelBlueprint-consequence-core-SPEC-v2.md`

## Verdict

The consequence-gating implementation now satisfies the core planted cases from the spec.

The original gap was binding behavior:

> The tool can compute that accuracy is unsafe, but it does not yet force the blueprint, confidence pill, metric chips, `train.py`, schema, ZIP export, or AI context to obey that computed consequence.

That has now been fixed. Computed consequences now produce a `decision`, `consequences.verdict`, `blocking` results, generated questions, UI state, corrected code, corrected schema, and export/AI context that obey the mutation.

Verification command:

```powershell
node --test tests/consequence-core.test.mjs
```

Current result:

```text
tests 4
pass 4
fail 0
```

## Current Implemented Result

### Fraud Idea, No CSV

Input:

```text
0.7% of transactions are fraud. I want the model to be accurate.
```

Current result:

- `verdict`: `needs_resolution`
- `confidence`: `Needs resolution`
- `decision.primary_metric`: `average_precision`
- blocking message includes `0.7%`, `0.993`, and `recall is 0`
- generated `train.py` uses `average_precision_score`

### Fraud/Churn With 94/6 CSV

Current result:

- CSV check computes `majority_accuracy: 0.94`
- CSV check computes `minority_recall: 0`
- `verdict`: `needs_resolution`
- `decision.primary_metric`: `average_precision`
- generated `train.py` uses `average_precision_score`

### Revenue Idea, No CSV

Input:

```text
We have a customer table with signup_date, total_payments_to_date, last_payment_date, current_mrr, and lifetime_value. Predict next-quarter revenue. Use a normal train/test split.
```

Current result:

- `verdict`: `needs_resolution`
- `decision.split_strategy`: `temporal`
- `target-leakage` blocks `total_payments_to_date`, `last_payment_date`, and `lifetime_value`
- generated `train.py` contains `TimeSeriesSplit`
- generated `train.py` does not contain `train_test_split`
- generated `schema.yaml` excludes `lifetime_value` and `total_payments_to_date`

### Clean House Price Idea

Input:

```text
Predict house price from sqft, location, and bedrooms using an out-of-time split.
```

Current result:

- `verdict`: `ok`
- zero blocking consequences
- confidence remains normal, not `Needs resolution`

## Historical Agent Evaluation

The notes below are retained as the pre-implementation baseline that motivated this pass.

## Agent Evaluation

I tested the current app as an agent would consume it: by generating blueprints, reading the returned summary, signals, files, agent spec, and dataset profile.

### 1. Fraud Idea, No CSV

Input:

```text
0.7% of transactions are fraud. I want the model to be accurate.
```

Spec expectation:

- Parse `positive_rate === 0.007`.
- Parse `stated_objective === "accuracy"`.
- Fire `metric-validity`.
- Return `verdict === "needs_resolution"`.
- Change metric to `average_precision`.
- Show pill `Needs resolution`.

Actual result:

- `task_type`: `classification`
- `confidence`: `High confidence`
- `signals`: `classification`, `cross entropy`, `ROC-AUC`
- `decision`: missing
- `consequences`: missing
- `executable_checks`: empty
- `train.py`: still contains `train_test_split`
- `train.py`: does not contain `average_precision`

Result: **Fail.** The app does not parse idea text into executable claims yet, so no pre-CSV consequence fires.

### 2. Fraud/Churn With 94/6 CSV

Input data:

- 100 rows
- 94 rows in class `0`
- 6 rows in class `1`
- target column: `churn`

Actual computed check:

```json
{
  "kind": "classification_majority_baseline",
  "majority_accuracy": 0.94,
  "minority_recall": 0,
  "macro_recall": 0.5,
  "executable_consequence": "Accuracy is unsafe as a primary metric: a majority-class predictor reaches 0.94 accuracy while minority-class recall is 0."
}
```

Spec expectation:

- CSV check wins over any claimed ratio.
- `metric-validity` blocks.
- `verdict === "needs_resolution"`.
- `decision.primary_metric === "average_precision"`.
- Confidence pill becomes `Needs resolution`.
- Generated code reflects the corrected metric.

Actual result:

- The numeric check is correct.
- The warning is present in `quality_warnings`.
- The summary includes `Majority baseline: 0.94 accuracy, minority recall 0, macro recall 0.5.`
- `confidence`: still `High confidence`
- `signals`: still `ROC-AUC`
- `decision`: missing
- `consequences`: missing
- `train.py`: still imports and prints `roc_auc_score`
- `train.py`: does not use `average_precision`

Result: **Partial pass.** The math works. The binding decision layer does not.

### 3. Revenue Idea, No CSV

Input:

```text
We have a customer table with signup_date, total_payments_to_date, last_payment_date, current_mrr, and lifetime_value. Predict next-quarter revenue. Use a normal train/test split.
```

Spec expectation:

- Parse `stated_split === "random"`.
- Parse time language from `next-quarter` and `signup_date`.
- Parse named columns.
- Fire `split-validity`.
- Fire `target-leakage` for `lifetime_value` and `total_payments_to_date`.
- Switch split to temporal.
- Generated `train.py` contains `TimeSeriesSplit`, not `train_test_split`.
- Leaking columns are absent from features/schema.

Actual result:

- `task_type`: `regression`
- `confidence`: `Medium confidence`
- `decision`: missing
- `consequences`: missing
- No named columns are parsed.
- No leakage blocks are created.
- `train.py`: contains `train_test_split`
- `train.py`: does not contain `TimeSeriesSplit`

Result: **Fail.** The parser, semantic leakage rules, and split gate are not implemented yet.

### 4. Clean House Price Idea

Input:

```text
Predict house price from sqft, location, and bedrooms using an out-of-time split.
```

Spec expectation:

- No blocking consequences.
- `verdict === "ok"`.
- Pill stays normal/high confidence.

Actual result:

- `task_type`: `regression`
- `confidence`: `Medium confidence`
- `decision`: missing
- `consequences`: missing
- `train.py`: still uses `train_test_split`

Result: **Not measurable yet.** There is no consequence verdict object, so the no-false-positive check cannot be asserted. Also, the out-of-time split is not parsed into a temporal decision.

## Spec Compliance Matrix

| Requirement | Current Status | Evidence |
|---|---:|---|
| CSV majority baseline math | Pass | Computes `0.94` accuracy and `0` minority recall. |
| Pre-CSV idea claim parser | Fail | No `idea-claims.mjs`; no `positive_rate` extraction. |
| Claimed classification check | Fail | No claimed check when no CSV is present. |
| `consequence-core.mjs` verdict | Fail | No `decision`, `consequences`, `blocking`, or `generated_questions` response fields. |
| Metric-validity block | Fail | 94/6 CSV warning exists but does not mutate metric/confidence/code. |
| Split-validity block | Fail | `normal train/test split` remains random. |
| Semantic target leakage | Fail | `lifetime_value` / `total_payments_to_date` are not parsed or blocked. |
| Confidence pill mutation | Fail | UI still reads `blueprint.confidence`. |
| Blocking band | Fail | No `#blocking-band` element. |
| Signal chips from corrected decision | Fail | UI still reads static `blueprint.signals`. |
| Export consistency | Fail | Generated code can contradict computed warnings. |
| AI consistency gate | Fail | AI receives the raw deterministic blueprint, not a consequence-mutated decision. |

## Conclusion

The current app is at the end of the previous milestone:

```text
executable checks exist -> results are shown as warnings
```

The spec is the next milestone:

```text
executable checks exist -> consequence core mutates decisions -> UI/code/export/AI obey the mutation
```

The most important next implementation is not more formulas. It is the deterministic consequence spine:

1. `idea-claims.mjs`
2. `claimedClassificationCheck`
3. `consequence-core.mjs`
4. `buildDraftDecision`
5. render/export/AI from the mutated decision
6. acceptance tests in `tests/consequence-core.test.mjs`
