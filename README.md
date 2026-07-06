---
title: MILLE ModelBlueprint
emoji: 🧭
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
---

# ModelBlueprint

ModelBlueprint is evolving into MILLE: a Machine Learning Logic Engine. It turns a plain-language project idea and an optional CSV into a blueprint with:

- ML task framing
- Multi-component ML system detection
- Decision trace output
- Recommended model path
- Data contract
- Statistics and optimization formulas
- Executable dataset checks, such as majority-class baselines and constant predictors
- Retrieved source-backed ML knowledge
- Starter Python files
- Agent-ready JSON instructions

Open `index.html` in a browser to try the prototype, or run the local server:

```powershell
cd "C:\Users\ahmed\Documents\ML tool or dataset for llms that gets adopted by companies,"
& ".\start-modelblueprint.ps1"
```

Then open `http://127.0.0.1:4173`.

If that port is already in use:

```powershell
& ".\start-modelblueprint.ps1" -Port 4174
```

Then open `http://127.0.0.1:4174`.

## Backend API

The server exposes:

```text
POST /api/analyze-dataset
POST /api/blueprint
POST /api/export-project
```

Example body:

```json
{
  "idea": "recommend products from user purchase history",
  "task": "auto",
  "audience": "business"
}
```

The response includes `retrieved_knowledge`, which is the current local RAG layer. It retrieves curated ML knowledge chunks from `knowledge-base.mjs`, including source URLs, formulas, assumptions, implementation notes, and pitfalls.

`POST /api/export-project` accepts the same body and returns a `.zip` containing:

- `project/data/`
- `project/notebooks/`
- `project/src/`
- `project/tests/`
- `project/README.md`
- `project/schema.yaml`
- `project/requirements.txt`
- `project/agent_spec.json`
- `project/retrieved_knowledge.json`
- `project/blueprint.md`

When a dataset profile is provided, the ZIP also includes:

- `project/data/training.csv`
- `project/data/SOURCE_FILENAME.txt`
- `project/data_profile.json`
- `project/src/preprocessing.py`
- `project/DATASET_PROFILE.md`

## Dataset-Aware Blueprinting

Upload a CSV in the app to call `POST /api/analyze-dataset`.

The profiler detects:

- Row and column counts
- Numeric, categorical, date, text, and ID columns
- Missing-value ratios
- Cardinality
- Candidate target columns
- Possible leakage and data-quality warnings

The generated blueprint then uses that profile to:

- Recommend a task type from the idea plus dataset shape
- Compute baseline consequences from the uploaded data
- Fill `schema.yaml` with actual columns
- Generate `preprocessing.py` with explicit feature lists
- Generate supervised training code with the inferred target
- Export `data_profile.json` with the project ZIP

## Executable Math Layer

The math layer is designed to produce computed facts, not just text that an LLM can ignore.

For classification datasets, the profiler computes a majority-class baseline from the actual target column:

```text
majority_accuracy = count(majority_class) / total_rows
recall[class] = true_positive[class] / actual_count[class]
```

If a CSV has 94 non-churn rows and 6 churn rows, the executable check returns:

```json
{
  "majority_accuracy": 0.94,
  "minority_recall": 0,
  "macro_recall": 0.5,
  "executable_consequence": "Accuracy is unsafe as a primary metric: a majority-class predictor reaches 0.94 accuracy while minority-class recall is 0."
}
```

That result is included in `dataset_profile.executable_checks`, the generated blueprint summary, the exported `DATASET_PROFILE.md`, and the AI refinement prompt. The model therefore has to route around the computed consequence by recommending better metrics, splits, thresholds, and acceptance tests.

For regression datasets, the profiler computes mean and median constant baselines with MAE and RMSE. For forecasting datasets, it computes a previous-value baseline when a date column and numeric target are available.

## Current Scope

The first version supports five task families:

- Classification
- Regression
- Clustering
- Time-series forecasting
- Recommendation systems

It also includes a multi-component architecture layer for broader operational systems. When an idea describes a platform rather than one model, ModelBlueprint can return:

- `project_type: "multi_component_system"`
- `decision_trace`
- reusable component specs for classification, regression, forecasting, recommendation, optimization, anomaly detection, API, and dashboard components
- a multi-component `agent_spec`

It uses deterministic backend logic plus a local source-backed retrieval layer today. A future version can add embeddings, vector search, and an LLM generation layer on top of the same knowledge schema.

## Semantic Retrieval

The app supports OpenAI embeddings for semantic retrieval.

Set your API key in PowerShell:

```powershell
$env:OPENAI_API_KEY = "your_api_key_here"
```

Build the local embeddings index:

```powershell
& "C:\Users\ahmed\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" .\scripts\index-knowledge.mjs
```

The index is written to:

```text
embeddings/knowledge-index.json
```

Runtime behavior:

- If `embeddings/knowledge-index.json` exists and `OPENAI_API_KEY` is set, retrieval uses semantic vector search plus keyword scoring.
- If the index or key is missing, retrieval falls back to keyword search and shows that status in the UI.

Dry-run the indexer without calling OpenAI:

```powershell
& "C:\Users\ahmed\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" .\scripts\index-knowledge.mjs --dry-run
```

## AI Refinement

The `AI` button calls:

```text
POST /api/ai-blueprint
```

It uses the deterministic blueprint plus retrieved knowledge as context, then asks OpenAI for:

- Missing questions
- Recommended adjustments
- Implementation notes
- Risk checks
- Acceptance tests

Default model:

```text
gpt-4.1-mini
```

Override it in PowerShell:

```powershell
$env:OPENAI_BLUEPRINT_MODEL = "your_preferred_model"
```

The AI refinement is optional. The app still works with deterministic blueprints, RAG retrieval, and ZIP export if this call is unavailable.
