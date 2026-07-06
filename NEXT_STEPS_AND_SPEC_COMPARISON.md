# ModelBlueprint Next Steps and Spec Comparison

This document compares the current repository against `ModelBlueprint-consequence-core-SPEC-v2.md` and turns the gap into an implementation plan.

## Implementation Status

The consequence-gating pass from `ModelBlueprint-consequence-core-SPEC-v2.md` has now been implemented.

The app now has:

- Backend blueprint generation
- Dataset profiling through `analyzeDataset`
- Executable dataset checks for classification, regression, and forecasting
- Pre-CSV idea parsing through `idea-claims.mjs`
- Claimed classification baseline checks for rare-event claims like `0.7% fraud`
- A deterministic `consequence-core.mjs` evaluator
- Binding mutation of objective, metric, split strategy, feature list, confidence, generated code, schema, ZIP export, and AI context
- Semantic leakage blocking for aggregate/post-outcome fields such as `lifetime_value`, `total_payments_to_date`, and `last_payment_date`
- UI blocking band and `Needs resolution` confidence pill
- Acceptance tests in `tests/consequence-core.test.mjs`
- Dataset-aware schema and starter code generation
- Semantic RAG retrieval with OpenAI embeddings
- AI refinement endpoint
- ZIP project export

The old failure state was:

> Computed consequences are still advisory. They do not yet mutate the blueprint's asserted decisions, confidence, metric, split strategy, generated code, or UI state.

Changed to:

> Computed consequences are binding. They now mutate the blueprint's asserted decisions, confidence, metric, split strategy, generated code, schema, export, and AI context.

Verification:

```powershell
node --test tests/consequence-core.test.mjs
```

Current passing cases:

- Fraud idea with no CSV: `0.7%` fraud + `accurate` blocks accuracy and switches to `average_precision`.
- Fraud/churn CSV with 94/6 class balance: CSV-computed `0.94` accuracy and `0` minority recall blocks accuracy.
- Revenue idea with `signup_date`, `total_payments_to_date`, `last_payment_date`, `current_mrr`, and `lifetime_value`: random split is changed to temporal, leakage columns are removed, and generated `train.py` uses `TimeSeriesSplit`.
- Clean house-price idea with out-of-time split: no false block.

The rest of this document is retained as the implementation blueprint and comparison history.

## Current State vs Spec

| Spec Area | Current Repo State | Gap |
|---|---|---|
| `dataset-profiler.mjs -> analyzeDataset` | Exists. Returns `executable_checks`, `leakage_warnings`, `quality_warnings`. | Shape mostly matches the spec's expectation. Keep stable. |
| `classificationExecutableChecks` | Exists and computes majority baseline, minority recall, macro recall, and `executable_consequence`. | Correct math exists, but consequence is not binding. |
| Regression/forecasting checks | Exist. | Useful, but not yet connected to binding decision mutations. |
| `leakageWarnings` | Exists, but only simple name-substring hints. | Replace with semantic leakage rules for aggregate/post-outcome columns. |
| Pre-CSV idea checks | Not implemented. | Need `idea-claims.mjs` so phrases like "0.7% fraud" trigger checks before CSV upload. |
| Claimed classification check | Not implemented. | Need `claimedClassificationCheck(claims)` bridge. |
| Consequence core | Not implemented. | Need `consequence-core.mjs` with `evaluateBlueprint`. |
| Proposed decision object | Not implemented as a first-class object. | Need `buildDraftDecision` and post-mutation `decision`. |
| Metric validity gate | Not implemented. | Severe imbalance/accuracy claims should block and switch objective/metric. |
| Split validity gate | Not implemented. | Time language/date columns plus random split should block and switch to temporal. |
| Target leakage gate | Not implemented. | Aggregate target-derived columns should block and be removed from features/schema. |
| UI blocking band | Not implemented. | Need red blocking band above blueprint summary. |
| Confidence pill mutation | Not implemented. | Pill must show `Needs resolution` when any block fires. |
| Signal chips from corrected decision | Not implemented. | Chips still come from static blueprint signals. |
| AI consistency gate | Partially present, but not corrected. | `/api/ai-blueprint` receives the current deterministic blueprint, not a consequence-mutated one. |
| Export consistency | Partially present. | ZIP exports generated code, but code is not regenerated from consequence-mutated decisions. |
| Acceptance tests | No test suite currently present. | Need deterministic tests for idea parsing, consequence evaluation, code generation, and no-false-positive cases. |

## Highest Priority Work

### 1. Add `idea-claims.mjs`

Purpose: make checks fire before a user uploads CSV data.

The parser should extract:

- `positive_rate`
- `stated_objective`
- `stated_objective_raw`
- `stated_split`
- `stated_split_raw`
- `target_phrase`
- `named_columns`
- `has_time_language`
- `task_guess`

Important behavior:

- Deterministic regex only.
- Every field nullable.
- Never throw.
- If parsing fails, return null fields and let checks no-op.

Example:

```text
"0.7% of transactions are fraud. I want the model to be accurate."
```

Should produce:

```json
{
  "positive_rate": 0.007,
  "stated_objective": "accuracy",
  "stated_objective_raw": "accurate",
  "task_guess": "classification"
}
```

### 2. Add `claimedClassificationCheck`

Purpose: reuse the executable math idea without CSV rows.

If `claims.positive_rate != null` and the task is classification:

```text
majority_accuracy = 1 - positive_rate
minority_recall = 0
```

The consequence string should match the dataset-computed wording:

```text
Accuracy is unsafe as a primary metric: a majority-class predictor reaches 0.993 accuracy while minority-class recall is 0.
```

Precedence rule:

- CSV check wins when a CSV exists.
- Claimed check is used only before CSV upload.

### 3. Add `consequence-core.mjs`

This is the main new spine.

It should expose:

```js
evaluateBlueprint({ claims, profile, draft })
```

And return:

```js
{
  verdict: "ok" | "needs_resolution",
  blocking: [],
  all: [],
  generated_questions: [],
  decision: {}
}
```

The key behavior is mutation:

- Computed checks must change the asserted decision.
- Blocks must set `decision.confidence = "needs_resolution"`.
- Blocks must produce literal, idea-specific messages.

### 4. Implement Three Binding Checks

#### `metric-validity`

Fires when:

- Classification has severe imbalance, or
- The idea asks for accuracy on a rare positive class.

Mutation:

```js
decision.objective = "cross_entropy";
decision.primary_metric = "average_precision";
decision.confidence = "needs_resolution";
```

Questions:

- Cost of a missed positive vs a false alarm?
- Minimum acceptable recall?

#### `split-validity`

Fires when:

- Time structure exists, and
- The selected/default split is random.

Mutation:

```js
decision.split_strategy = "temporal";
decision.confidence = "needs_resolution";
```

Message must name the date/time signal literally, such as `signup_date`, `created_at`, or `next quarter`.

#### `target-leakage`

Fires when:

- A feature appears to encode the target, future outcome, aggregate-of-target, or post-outcome timestamp.

Mutation:

```js
decision.features = decision.features.filter(...)
decision.confidence = "needs_resolution";
```

The feature must also be removed from generated `schema.yaml` and training code.

## Leakage Rule Upgrade

Replace `leakageWarnings(columns, targetName)` with:

```js
leakageWarnings(columns, targetName, { targetPhrase })
```

Rules:

1. Aggregate-of-target: block `lifetime_value`, `total_payments_to_date`, `cumulative_sales`, etc. when predicting future revenue/payments/value/sales.
2. Post-outcome timestamp: block or warn on fields like `last_payment_date` for future revenue.
3. Direct restatement: warn on fields like `current_mrr` for revenue unless known strictly before prediction time.
4. Name-pattern fallback: keep the existing `future|post|after|outcome|result` style warning.

Return:

```js
{ column, severity: "block" | "warn", reason }
```

## Blueprint Engine Changes

Add:

```js
buildDraftDecision({ idea, taskKey, datasetProfile })
```

Draft decision should include:

```js
{
  task_type,
  objective,
  primary_metric,
  split_strategy,
  features,
  target,
  confidence
}
```

Then all rendering should use:

```text
draft decision -> evaluateBlueprint -> mutated decision -> rendered blueprint/files/schema/AI context
```

Do not let `train.py`, `schema.yaml`, the signal chips, or AI refinement use the raw template after a blocking check fires.

## UI Changes

Add a blocking band above the blueprint summary:

```html
<div id="blocking-band"></div>
```

Behavior:

- Hidden when no blocks.
- Red/rose styling when blocks exist.
- Lists each blocking message and remedy.

Update confidence pill:

- `ok` -> current confidence text.
- `needs_resolution` -> `Needs resolution` with `.pill-block`.

Update chips:

- `#signal-loss` from `decision.objective`
- `#signal-metric` from `decision.primary_metric`

Update questions:

- Use `generated_questions` from `evaluateBlueprint`.
- Do not rely on static missing-question lists when consequences fire.

## Server/API Changes

For `/api/blueprint`, `/api/export-project`, and `/api/ai-blueprint`:

1. Parse idea claims.
2. Use dataset profile if present.
3. Build draft decision.
4. Run `evaluateBlueprint`.
5. Generate blueprint/files from the mutated decision.
6. Return:

```json
{
  "decision": {},
  "consequences": {
    "verdict": "ok",
    "blocking": [],
    "all": []
  },
  "generated_questions": []
}
```

For `/api/ai-blueprint`:

- Pass the mutated decision and blocking results to the LLM.
- Do not pass a raw, contradictory template as the authority.

## Export ZIP Changes

ZIP export must reflect the corrected decision.

For a temporal block:

- `project/src/train.py` should contain `TimeSeriesSplit`.
- It should not contain `train_test_split`.

For target leakage:

- Leaking columns must be absent from `schema.yaml`.
- Leaking columns must be absent from generated feature lists.
- `agent_spec.json` should explain the exclusion and consequence.

## Acceptance Tests To Add

Create:

```text
tests/consequence-core.test.mjs
```

Minimum test cases:

### Fraud Idea, No CSV

Input:

```text
0.7% of transactions are fraud. I want the model to be accurate.
```

Expected:

- `positive_rate === 0.007`
- `stated_objective === "accuracy"`
- `metric-validity` blocks
- Message includes `0.993` and `recall is 0`
- `verdict === "needs_resolution"`
- `decision.primary_metric === "average_precision"`
- Confidence pill should render `Needs resolution`

### Fraud CSV, 94/6

Expected:

- CSV executable check wins over idea claim.
- `majority_accuracy === 0.94`
- `minority_recall === 0`
- Same metric block and mutation.

### Revenue Idea, No CSV

Input:

```text
We have columns total_payments_to_date, last_payment_date, current_mrr, and lifetime_value.
Predict next-quarter revenue. Use a normal train/test split.
```

Expected:

- `stated_split === "random"`
- `has_time_language === true`
- Named columns include `lifetime_value` and `total_payments_to_date`
- `split-validity` blocks and sets temporal split
- `target-leakage` blocks aggregate leakage columns
- `train.py` contains `TimeSeriesSplit`
- `train.py` does not contain `train_test_split`

### Clean House Price Idea

Input:

```text
Predict house price from sqft, location, and bedrooms using an out-of-time split.
```

Expected:

- `verdict === "ok"`
- No blocking consequences
- Pill remains high/normal confidence

## Recommended Build Order

1. Add `idea-claims.mjs`.
2. Add parser unit tests.
3. Add `claimedClassificationCheck` to `dataset-profiler.mjs`.
4. Replace `leakageWarnings` with semantic severity-aware leakage checks.
5. Add `consequence-core.mjs`.
6. Add `buildDraftDecision` to `blueprint-engine.mjs`.
7. Update blueprint assembly to render from mutated decision.
8. Update `supervisedTrainPy` to switch between `train_test_split` and `TimeSeriesSplit`.
9. Update schema generation to remove blocked leakage features.
10. Wire server responses with `decision`, `consequences`, and `generated_questions`.
11. Add blocking band and pill styling in the UI.
12. Feed mutated decision into AI refinement.
13. Update ZIP export to include consequence results.
14. Add acceptance tests.

## What Not To Do

- Do not rebuild semantic RAG for this pass.
- Do not add new task families.
- Do not add model training inside the tool.
- Do not let the LLM override deterministic consequence gates.
- Do not change `analyzeDataset` return shape unless every caller is updated.
- Do not make generic warnings count as blocking consequences unless they include literal user data or computed values.

## Definition Of Done

The pass is complete when:

- A no-CSV fraud idea with `0.7%` fraud blocks accuracy and shows `Needs resolution`.
- A no-CSV revenue idea with `lifetime_value` and `total_payments_to_date` blocks leakage and random split.
- The UI top-level metric/split/confidence changes after blocks.
- Exported `train.py` and `schema.yaml` reflect the corrected decision.
- AI refinement cannot contradict the corrected decision.
- Tests prove the above cases.
