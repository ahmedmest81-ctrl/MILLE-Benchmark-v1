import { retrieveKnowledge } from "./knowledge-base.mjs";
import { retrieveKnowledgeSemantic, embeddingIndexStatus } from "./semantic-retrieval.mjs";
import { evaluateBlueprint } from "./consequence-core.mjs";
import { parseIdeaClaims } from "./idea-claims.mjs";
import { detectProjectComplexity } from "./project-complexity.mjs";
import { evaluateComponentConsequences } from "./component-consequences.mjs";

export const BLUEPRINTS = {
  classification: {
    title: "Classification System",
    signals: ["classification", "cross entropy", "ROC-AUC"],
    keywords: ["classify", "classification", "churn", "cancel", "cancellation", "subscription", "fraud", "spam", "approve", "default", "risk", "detect"],
    confidence: "High confidence",
    summary: {
      "Problem framing": "Supervised learning. Predict a discrete target class from historical labeled examples.",
      "Baseline": "Start with logistic regression to establish a transparent reference model.",
      "Production model": "Compare calibrated tree ensembles such as RandomForest or HistGradientBoosting.",
      "Optimization": "Minimize cross entropy with regularization and threshold tuning for business tradeoffs."
    },
    data: [
      "Labeled rows with one target class per entity or event.",
      "Numerical, categorical, timestamp, and optional text-derived features.",
      "Train, validation, and test splits separated by time when leakage is possible.",
      "Class balance report and missing-value profile."
    ],
    path: [
      "Define the target label and positive class.",
      "Build preprocessing for numeric and categorical features.",
      "Train a logistic baseline, then compare stronger models.",
      "Calibrate probabilities and choose an operating threshold.",
      "Package inference with the same preprocessing pipeline."
    ],
    formulas: [
      {
        tag: "Probability",
        title: "Logistic Function",
        formula: "p(y=1|x) = 1 / (1 + exp(-(w^T x + b)))",
        note: "Maps model scores into probabilities for binary decisions."
      },
      {
        tag: "Loss",
        title: "Binary Cross Entropy",
        formula: "L = -1/N * sum[y log(p) + (1-y) log(1-p)]",
        note: "Penalizes confident wrong predictions more heavily."
      },
      {
        tag: "Metric",
        title: "Precision and Recall",
        formula: "precision = TP/(TP+FP), recall = TP/(TP+FN)",
        note: "Separates false alarms from missed positive cases."
      },
      {
        tag: "Optimization",
        title: "Regularized Objective",
        formula: "min_w L(w) + lambda * ||w||_2^2",
        note: "Reduces overfitting and keeps coefficients stable."
      }
    ],
    files: {
      "train.py": `from pathlib import Path

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


DATA_PATH = Path("data/training.csv")
TARGET = "target"


def build_pipeline(numeric_features, categorical_features):
    numeric = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])
    categorical = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("encoder", OneHotEncoder(handle_unknown="ignore")),
    ])
    preprocess = ColumnTransformer([
        ("num", numeric, numeric_features),
        ("cat", categorical, categorical_features),
    ])
    model = HistGradientBoostingClassifier(max_iter=250, learning_rate=0.06)
    return Pipeline([("preprocess", preprocess), ("model", model)])


def main():
    df = pd.read_csv(DATA_PATH)
    y = df[TARGET].astype(int)
    X = df.drop(columns=[TARGET])

    numeric_features = X.select_dtypes(include="number").columns.tolist()
    categorical_features = [c for c in X.columns if c not in numeric_features]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )
    pipeline = build_pipeline(numeric_features, categorical_features)
    pipeline.fit(X_train, y_train)

    probabilities = pipeline.predict_proba(X_test)[:, 1]
    predictions = (probabilities >= 0.5).astype(int)

    print("ROC-AUC:", roc_auc_score(y_test, probabilities))
    print(classification_report(y_test, predictions))


if __name__ == "__main__":
    main()
`,
      "evaluate.py": `import pandas as pd
from sklearn.metrics import confusion_matrix, precision_recall_curve, roc_auc_score


def evaluate_binary_classifier(y_true, y_score, threshold=0.5):
    y_pred = (y_score >= threshold).astype(int)
    precision, recall, thresholds = precision_recall_curve(y_true, y_score)
    return {
        "roc_auc": float(roc_auc_score(y_true, y_score)),
        "confusion_matrix": confusion_matrix(y_true, y_pred).tolist(),
        "precision_curve": precision.tolist(),
        "recall_curve": recall.tolist(),
        "thresholds": thresholds.tolist(),
    }
`,
      "inference.py": `import joblib
import pandas as pd


def predict(input_rows, model_path="artifacts/model.joblib"):
    pipeline = joblib.load(model_path)
    frame = pd.DataFrame(input_rows)
    scores = pipeline.predict_proba(frame)[:, 1]
    return [{"score": float(score), "label": int(score >= 0.5)} for score in scores]
`
    }
  },
  regression: {
    title: "Regression System",
    signals: ["regression", "mean squared error", "MAE"],
    keywords: ["predict price", "price", "revenue", "demand", "value", "score", "amount", "estimate"],
    confidence: "Medium confidence",
    summary: {
      "Problem framing": "Supervised learning. Predict a continuous numerical target.",
      "Baseline": "Start with linear regression or ridge regression to validate signal.",
      "Production model": "Compare gradient boosting regressors against the baseline.",
      "Optimization": "Minimize squared or absolute error depending on outlier sensitivity."
    },
    data: [
      "Rows with a numeric target and timestamp or entity identifier.",
      "Feature distributions, outlier report, and missing-value profile.",
      "Holdout split that matches the deployment setting.",
      "Business tolerance for underprediction versus overprediction."
    ],
    path: [
      "Define the target unit and prediction horizon.",
      "Create leakage checks for future or post-outcome columns.",
      "Train ridge regression as a baseline.",
      "Compare MAE, RMSE, and residual patterns.",
      "Save the pipeline and document valid input ranges."
    ],
    formulas: [
      {
        tag: "Loss",
        title: "Mean Squared Error",
        formula: "MSE = 1/N * sum((y_i - y_hat_i)^2)",
        note: "Strongly penalizes large errors."
      },
      {
        tag: "Metric",
        title: "Mean Absolute Error",
        formula: "MAE = 1/N * sum(|y_i - y_hat_i|)",
        note: "Gives an error value in the target's original unit."
      },
      {
        tag: "Model",
        title: "Linear Prediction",
        formula: "y_hat = w^T x + b",
        note: "A transparent starting point for feature relationships."
      },
      {
        tag: "Optimization",
        title: "Ridge Regression",
        formula: "min_w ||y - Xw||_2^2 + alpha ||w||_2^2",
        note: "Stabilizes estimates when features are correlated."
      }
    ],
    files: {
      "train.py": `from pathlib import Path

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


DATA_PATH = Path("data/training.csv")
TARGET = "target"


def main():
    df = pd.read_csv(DATA_PATH)
    y = df[TARGET]
    X = df.drop(columns=[TARGET])
    numeric_features = X.select_dtypes(include="number").columns.tolist()
    categorical_features = [c for c in X.columns if c not in numeric_features]

    preprocess = ColumnTransformer([
        ("num", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]), numeric_features),
        ("cat", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")), ("encoder", OneHotEncoder(handle_unknown="ignore"))]), categorical_features),
    ])
    model = HistGradientBoostingRegressor(max_iter=250, learning_rate=0.06)
    pipeline = Pipeline([("preprocess", preprocess), ("model", model)])

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    pipeline.fit(X_train, y_train)
    pred = pipeline.predict(X_test)

    print("MAE:", mean_absolute_error(y_test, pred))
    print("RMSE:", mean_squared_error(y_test, pred, squared=False))
    print("R2:", r2_score(y_test, pred))


if __name__ == "__main__":
    main()
`,
      "evaluate.py": `import numpy as np


def residual_report(y_true, y_pred):
    residuals = np.asarray(y_true) - np.asarray(y_pred)
    return {
        "mean_error": float(residuals.mean()),
        "median_abs_error": float(np.median(np.abs(residuals))),
        "p90_abs_error": float(np.quantile(np.abs(residuals), 0.9)),
    }
`
    }
  },
  clustering: {
    title: "Clustering System",
    signals: ["clustering", "inertia", "silhouette"],
    keywords: ["segment", "cluster", "group", "persona", "discover", "unsupervised", "similar"],
    confidence: "Medium confidence",
    summary: {
      "Problem framing": "Unsupervised learning. Group similar records without target labels.",
      "Baseline": "Start with K-means after scaling and feature review.",
      "Production model": "Compare K-means, Gaussian mixtures, and density-based clustering.",
      "Optimization": "Minimize within-cluster distance while validating interpretability."
    },
    data: [
      "Rows representing entities to group.",
      "Numerical features or encoded categories with clear meaning.",
      "Scaling rules so high-magnitude columns do not dominate.",
      "Human-readable labels for cluster interpretation."
    ],
    path: [
      "Select behavior or attribute features.",
      "Scale data and reduce dimensionality for inspection.",
      "Search cluster counts with silhouette and inertia.",
      "Name clusters from top distinguishing features.",
      "Export assignments and monitoring statistics."
    ],
    formulas: [
      {
        tag: "Objective",
        title: "K-means Inertia",
        formula: "J = sum_k sum_{x in C_k} ||x - mu_k||^2",
        note: "Measures compactness of clusters around centroids."
      },
      {
        tag: "Metric",
        title: "Silhouette Score",
        formula: "s = (b - a) / max(a, b)",
        note: "Compares within-cluster distance to nearest other cluster."
      },
      {
        tag: "Distance",
        title: "Euclidean Distance",
        formula: "d(x,z) = sqrt(sum_j (x_j - z_j)^2)",
        note: "The default geometry after careful feature scaling."
      },
      {
        tag: "Transform",
        title: "Standard Score",
        formula: "z = (x - mean(x)) / std(x)",
        note: "Places features on comparable scales."
      }
    ],
    files: {
      "cluster.py": `from pathlib import Path

import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


DATA_PATH = Path("data/entities.csv")


def main():
    df = pd.read_csv(DATA_PATH)
    features = df.select_dtypes(include="number")
    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("cluster", KMeans(n_clusters=4, n_init="auto", random_state=42)),
    ])
    labels = pipeline.fit_predict(features)
    scaled = pipeline.named_steps["scaler"].transform(features)

    df["cluster"] = labels
    print("silhouette:", silhouette_score(scaled, labels))
    print(df.groupby("cluster")[features.columns].mean())
    df.to_csv("artifacts/cluster_assignments.csv", index=False)


if __name__ == "__main__":
    main()
`,
      "profile_clusters.py": `def top_cluster_differences(cluster_means, global_means, n=5):
    diffs = cluster_means.subtract(global_means, axis=1).abs()
    return {
        int(cluster_id): diffs.loc[cluster_id].sort_values(ascending=False).head(n).index.tolist()
        for cluster_id in diffs.index
    }
`
    }
  },
  forecasting: {
    title: "Time-series Forecasting System",
    signals: ["forecasting", "rolling validation", "MAPE"],
    keywords: ["forecast", "time series", "next week", "next month", "sales over time", "demand over time", "traffic"],
    confidence: "Medium confidence",
    summary: {
      "Problem framing": "Supervised forecasting. Predict future values from time-ordered history.",
      "Baseline": "Start with seasonal naive and moving-average baselines.",
      "Production model": "Use lag features with gradient boosting or a dedicated forecasting model.",
      "Optimization": "Minimize forecast error under rolling-origin validation."
    },
    data: [
      "Timestamp column, target value, and stable time granularity.",
      "Known future covariates such as promotions, holidays, or calendar fields.",
      "Missing interval report and outlier policy.",
      "Backtest windows that reflect operational forecasting."
    ],
    path: [
      "Resample data to one consistent time interval.",
      "Create lag, rolling mean, and calendar features.",
      "Evaluate with rolling-origin splits.",
      "Compare naive, statistical, and machine-learning forecasts.",
      "Export predictions with prediction intervals when possible."
    ],
    formulas: [
      {
        tag: "Baseline",
        title: "Seasonal Naive",
        formula: "y_hat_t = y_{t-s}",
        note: "Uses the value from the previous season as a sanity check."
      },
      {
        tag: "Feature",
        title: "Rolling Mean",
        formula: "m_t = 1/w * sum_{i=1}^{w} y_{t-i}",
        note: "Summarizes recent history without using future values."
      },
      {
        tag: "Metric",
        title: "MAPE",
        formula: "MAPE = 100/N * sum(|(y - y_hat) / y|)",
        note: "Reports average percentage error when targets are nonzero."
      },
      {
        tag: "Validation",
        title: "Rolling Origin",
        formula: "train: [1..t], test: [t+1..t+h]",
        note: "Keeps evaluation aligned with future deployment."
      }
    ],
    files: {
      "forecast.py": `from pathlib import Path

import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error


DATA_PATH = Path("data/timeseries.csv")
DATE_COL = "date"
TARGET = "target"


def make_features(df):
    frame = df.sort_values(DATE_COL).copy()
    frame["dayofweek"] = frame[DATE_COL].dt.dayofweek
    frame["month"] = frame[DATE_COL].dt.month
    for lag in [1, 7, 14, 28]:
        frame[f"lag_{lag}"] = frame[TARGET].shift(lag)
    frame["rolling_7"] = frame[TARGET].shift(1).rolling(7).mean()
    return frame.dropna()


def main():
    df = pd.read_csv(DATA_PATH, parse_dates=[DATE_COL])
    features = make_features(df)
    split = int(len(features) * 0.8)
    train, test = features.iloc[:split], features.iloc[split:]

    feature_cols = [c for c in features.columns if c not in [DATE_COL, TARGET]]
    model = HistGradientBoostingRegressor(max_iter=250, learning_rate=0.05)
    model.fit(train[feature_cols], train[TARGET])
    pred = model.predict(test[feature_cols])
    print("MAE:", mean_absolute_error(test[TARGET], pred))


if __name__ == "__main__":
    main()
`
    }
  },
  recommendation: {
    title: "Recommendation System",
    signals: ["recommendation", "ranking loss", "NDCG"],
    keywords: ["recommend", "recommendation", "personalize", "ranking", "similar items", "next best", "suggest"],
    confidence: "Medium confidence",
    summary: {
      "Problem framing": "Ranking and retrieval. Match users to relevant items.",
      "Baseline": "Start with popularity and item-similarity recommendations.",
      "Production model": "Move to matrix factorization or two-tower retrieval when interaction data is rich.",
      "Optimization": "Optimize ranking quality and diversity, not only point prediction."
    },
    data: [
      "User, item, event type, timestamp, and optional rating or purchase amount.",
      "Item metadata for cold-start fallback.",
      "Train/test split by time to avoid future interaction leakage.",
      "Business rules for eligibility, inventory, and safety filters."
    ],
    path: [
      "Build a popularity baseline.",
      "Create user-item interaction matrix.",
      "Train collaborative filtering with implicit feedback.",
      "Evaluate top-k ranking metrics.",
      "Add filtering, explanations, and cold-start fallbacks."
    ],
    formulas: [
      {
        tag: "Model",
        title: "Matrix Factorization",
        formula: "r_hat_ui = p_u^T q_i + b_u + b_i",
        note: "Represents users and items in a shared latent space."
      },
      {
        tag: "Similarity",
        title: "Cosine Similarity",
        formula: "cos(x,z) = (x dot z) / (||x|| ||z||)",
        note: "Ranks nearby users, items, or embeddings."
      },
      {
        tag: "Metric",
        title: "NDCG@K",
        formula: "NDCG@K = DCG@K / IDCG@K",
        note: "Rewards relevant items appearing near the top."
      },
      {
        tag: "Loss",
        title: "Pairwise Ranking",
        formula: "L = -log sigma(s(u,i+) - s(u,i-))",
        note: "Learns to score positive items above sampled negatives."
      }
    ],
    files: {
      "recommend.py": `from pathlib import Path

import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity


DATA_PATH = Path("data/interactions.csv")


def main():
    interactions = pd.read_csv(DATA_PATH)
    matrix = interactions.pivot_table(
        index="user_id",
        columns="item_id",
        values="event_strength",
        aggfunc="sum",
        fill_value=0,
    )
    item_similarity = pd.DataFrame(
        cosine_similarity(matrix.T),
        index=matrix.columns,
        columns=matrix.columns,
    )

    seed_item = matrix.columns[0]
    recommendations = item_similarity[seed_item].sort_values(ascending=False).head(10)
    print(recommendations)


if __name__ == "__main__":
    main()
`,
      "metrics.py": `import math


def dcg_at_k(relevances, k):
    return sum((2 ** rel - 1) / math.log2(idx + 2) for idx, rel in enumerate(relevances[:k]))


def ndcg_at_k(relevances, ideal_relevances, k=10):
    ideal = dcg_at_k(sorted(ideal_relevances, reverse=True), k)
    return 0.0 if ideal == 0 else dcg_at_k(relevances, k) / ideal
`
    }
  }
};

export const COMMON_FILES = {
  "README.md": `# ML Project Blueprint

## Objective
Describe the business goal, prediction target, users, and expected decision workflow.

## Data
- Source tables or files
- Target definition
- Feature dictionary
- Train, validation, and test split policy

## Modeling
- Baseline model
- Candidate production model
- Loss function
- Metrics

## Deployment
- Batch or online inference
- Monitoring metrics
- Retraining trigger
`,
  "schema.yaml": `dataset:
  path: data/training.csv
  target: target
  entity_id: id
  split_policy: time_or_stratified

validation:
  required_columns: []
  nullable_columns: []
  leakage_checks: true
`
};

export function detectTask(text) {
  const input = String(text || "").toLowerCase();
  if (/\b(?:detect|find|flag)\s+anomal(?:y|ies)\b|\banomaly detection\b/.test(input) && /\b(without|no|unlabeled|unsupervised)\s+(?:incident\s+)?labels?\b|\bwithout incident labels\b/.test(input)) {
    return "clustering";
  }
  if (/\b(yield|delivery time|arrival time|duration|eta|minutes?|hours?|days?|per hectare)\b/.test(input)) {
    return "regression";
  }
  if (/\b(churn|cancel|cancellation|unsubscribe|subscription users?)\b/.test(input)) {
    return "classification";
  }
  if (/\b(fraud|risk|default|suspicious|chargeback|aml|approve|decline|detect)\b/.test(input)) {
    return "classification";
  }
  if (/\b(recommend|recommendation|recommender|personalize|ranking|next best)\b/.test(input)) {
    return "recommendation";
  }
  if (/\b(forecast|time series|sales over time|demand over time|traffic over time)\b/.test(input)) {
    return "forecasting";
  }
  const scores = Object.entries(BLUEPRINTS).map(([key, blueprint]) => {
    const score = blueprint.keywords.reduce((total, keyword, index) => {
      const weight = index === 0 ? 2 : 1;
      return total + (input.includes(keyword) ? weight : 0);
    }, 0);
    return [key, score];
  });
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][1] > 0 ? scores[0][0] : "classification";
}

export function titleFromIdea(idea, blueprint) {
  const clean = String(idea || "")
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "")
    .trim();
  if (!clean) return blueprint.title;
  const words = clean.split(" ").filter(Boolean).slice(0, 8);
  const title = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
  return `${title} Blueprint`;
}

export function getFiles(blueprint) {
  return { ...blueprint.files, ...COMMON_FILES };
}

export function buildProjectTree(blueprint) {
  const fileNames = Object.keys(getFiles(blueprint));
  return buildProjectTreeFromFiles(fileNames);
}

function buildProjectTreeFromFiles(fileNames) {
  return `project/
|-- data/
|   |-- training.csv
|-- artifacts/
|   |-- model.joblib
|-- notebooks/
|   |-- exploration.ipynb
|-- src/
${fileNames
  .filter((name) => name.endsWith(".py"))
  .map((name) => `|   |-- ${name}`)
  .join("\n")}
|-- tests/
|   |-- test_data_contract.py
|-- README.md
|-- schema.yaml`;
}

function yamlList(items, indent = 4) {
  const prefix = " ".repeat(indent);
  if (!items || items.length === 0) return " []";
  return `\n${items.map((item) => `${prefix}- ${JSON.stringify(item)}`).join("\n")}`;
}

function decisionFeatureSet(decision) {
  return new Set((decision?.features || []).map((feature) => String(feature).toLowerCase()));
}

function allowedFeatures(items, decision) {
  const allowed = decisionFeatureSet(decision);
  if (!allowed.size) return items || [];
  return (items || []).filter((item) => allowed.has(String(item).toLowerCase()));
}

function dateLikeFeatures(features = []) {
  return features.filter((feature) => /(date|time|timestamp|signup|created|_at)\b/i.test(feature));
}

function datasetSchema(profile, decision = null) {
  const inferred = profile.inferred || {};
  const required = profile.columns.filter((column) => column.missing_count === 0).map((column) => column.name);
  const nullable = profile.columns.filter((column) => column.missing_count > 0).map((column) => column.name);
  const numeric = allowedFeatures(inferred.numeric_features || [], decision);
  const categorical = allowedFeatures(inferred.categorical_features || [], decision);
  const text = allowedFeatures(inferred.text_features || [], decision);
  const excluded = Array.from(
    new Set([
      ...(inferred.excluded_features || []),
      ...profile.columns
        .map((column) => column.name)
        .filter((name) => decision?.features?.length && !decisionFeatureSet(decision).has(name.toLowerCase()) && name !== inferred.target)
    ])
  );
  return `dataset:
  path: data/training.csv
  source_filename: ${JSON.stringify(profile.filename || "uploaded.csv")}
  target: ${JSON.stringify(inferred.target || "target")}
  task_type: ${JSON.stringify(inferred.task_type || "classification")}
  entity_id:${yamlList(inferred.id_columns || [], 4)}
  date_columns:${yamlList(inferred.date_columns || [], 4)}
  split_policy: ${decision?.split_strategy === "temporal" ? "time_based" : "stratified_or_random"}

features:
  numeric:${yamlList(numeric, 4)}
  categorical:${yamlList(categorical, 4)}
  text:${yamlList(text, 4)}
  excluded:${yamlList(excluded, 4)}

validation:
  required_columns:${yamlList(required, 4)}
  nullable_columns:${yamlList(nullable, 4)}
  leakage_checks: true
`;
}

function decisionSchema(decision) {
  const features = decision.features || [];
  const dates = dateLikeFeatures(features);
  return `dataset:
  path: data/training.csv
  target: ${JSON.stringify(decision.target || "target")}
  task_type: ${JSON.stringify(decision.task_type || "classification")}
  split_policy: ${decision.split_strategy === "temporal" ? "time_based" : "stratified_or_random"}

features:
  provided:${yamlList(features, 4)}
  date_columns:${yamlList(dates, 4)}
  excluded: []

validation:
  required_columns: []
  nullable_columns: []
  leakage_checks: true
`;
}

function preprocessingPy(profile, decision = null) {
  const inferred = profile.inferred || {};
  const numeric = allowedFeatures(inferred.numeric_features || [], decision);
  const categorical = allowedFeatures(inferred.categorical_features || [], decision);
  const text = allowedFeatures(inferred.text_features || [], decision);
  const excluded = Array.from(
    new Set([
      ...(inferred.excluded_features || []),
      ...profile.columns
        .map((column) => column.name)
        .filter((name) => decision?.features?.length && !decisionFeatureSet(decision).has(name.toLowerCase()) && name !== inferred.target)
    ])
  );
  return `from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


NUMERIC_FEATURES = ${JSON.stringify(numeric, null, 4)}
CATEGORICAL_FEATURES = ${JSON.stringify(categorical, null, 4)}
TEXT_FEATURES = ${JSON.stringify(text, null, 4)}
EXCLUDED_FEATURES = ${JSON.stringify(excluded, null, 4)}


def build_preprocessor():
    numeric = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])
    categorical = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("encoder", OneHotEncoder(handle_unknown="ignore")),
    ])
    transformers = []
    if NUMERIC_FEATURES:
        transformers.append(("num", numeric, NUMERIC_FEATURES))
    if CATEGORICAL_FEATURES:
        transformers.append(("cat", categorical, CATEGORICAL_FEATURES))
    return ColumnTransformer(transformers=transformers, remainder="drop")
`;
}

function noProfilePreprocessingPy(decision) {
  const features = decision.features || [];
  const dateFeatures = dateLikeFeatures(features);
  const nonDateFeatures = features.filter((feature) => !dateFeatures.includes(feature));
  return `from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


NUMERIC_FEATURES = []
CATEGORICAL_FEATURES = ${JSON.stringify(nonDateFeatures, null, 4)}
TEXT_FEATURES = []
DATE_FEATURES = ${JSON.stringify(dateFeatures, null, 4)}
EXCLUDED_FEATURES = []


def build_preprocessor():
    categorical = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("encoder", OneHotEncoder(handle_unknown="ignore")),
    ])
    transformers = []
    if NUMERIC_FEATURES:
        transformers.append(("num", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]), NUMERIC_FEATURES))
    if CATEGORICAL_FEATURES:
        transformers.append(("cat", categorical, CATEGORICAL_FEATURES))
    return ColumnTransformer(transformers=transformers, remainder="drop")
`;
}

function inputValidationPy(decision) {
  const constraints = decision.input_constraints || [];
  return `from datetime import datetime


INPUT_CONSTRAINTS = ${pythonLiteral(constraints)}


def _reject_bool_number(value, field):
    if isinstance(value, bool):
        raise ValueError(f"{field} must be numeric, not boolean.")


def _require_number(value, field):
    _reject_bool_number(value, field)
    if not isinstance(value, (int, float)):
        raise ValueError(f"{field} must be numeric.")
    return float(value)


def _validate_one(field, kind, value, nullable=False):
    if value is None:
        if nullable:
            return
        raise ValueError(f"{field} is required.")

    if kind == "probability":
        number = _require_number(value, field)
        if number < 0 or number > 1:
            raise ValueError(f"{field} must satisfy 0 <= x <= 1.")
    elif kind == "number":
        _require_number(value, field)
    elif kind == "amount":
        number = _require_number(value, field)
        if number < 0:
            raise ValueError(f"{field} must satisfy x >= 0.")
    elif kind == "count":
        _reject_bool_number(value, field)
        if not isinstance(value, int):
            raise ValueError(f"{field} must be an integer.")
        if value < 0:
            raise ValueError(f"{field} must satisfy integer x >= 0.")
    elif kind == "timestamp":
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{field} must be a parseable datetime string.")
        try:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError(f"{field} must be a parseable datetime string.") from exc
    elif kind in {"categorical", "id"}:
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{field} must be a non-empty string.")
    elif kind == "unknown":
        raise ValueError(f"{field} has unknown type; assert a validation rule before scoring.")


def validate_features(features):
    for constraint in INPUT_CONSTRAINTS:
        field = constraint["field"]
        _validate_one(field, constraint["kind"], features.get(field), constraint.get("nullable", False))
    return features
`;
}

function pythonLiteral(value, indent = 0) {
  const space = " ".repeat(indent);
  const next = indent + 4;
  const nextSpace = " ".repeat(next);
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "None";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[\n${value.map((item) => `${nextSpace}${pythonLiteral(item, next)}`).join(",\n")}\n${space}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return "{}";
    return `{\n${entries.map(([key, item]) => `${nextSpace}${JSON.stringify(key)}: ${pythonLiteral(item, next)}`).join(",\n")}\n${space}}`;
  }
  return JSON.stringify(String(value));
}

function invalidValueForConstraint(constraint) {
  if (constraint.kind === "probability") return 1.7;
  if (constraint.kind === "number") return "not-a-number";
  if (constraint.kind === "amount") return -5;
  if (constraint.kind === "count") return -1;
  if (constraint.kind === "timestamp") return "not-a-date";
  if (constraint.kind === "categorical" || constraint.kind === "id") return "";
  return "ambiguous";
}

function validValueForConstraint(constraint) {
  if (constraint.kind === "probability") return 0.4;
  if (constraint.kind === "number") return 42;
  if (constraint.kind === "amount") return 100;
  if (constraint.kind === "count") return 2;
  if (constraint.kind === "timestamp") return "2026-01-01T00:00:00";
  if (constraint.kind === "categorical") return "known_category";
  if (constraint.kind === "id") return "id-1";
  return "asserted";
}

function inputValidationTestsPy(decision) {
  const constraints = (decision.input_constraints || []).filter((constraint) => constraint.kind !== "unknown");
  const valid = Object.fromEntries(constraints.map((constraint) => [constraint.field, validValueForConstraint(constraint)]));
  const cases = constraints.map((constraint) => ({
    field: constraint.field,
    invalid: invalidValueForConstraint(constraint)
  }));
  const boolCases = constraints
    .filter((constraint) => ["probability", "number", "amount", "count"].includes(constraint.kind))
    .map((constraint) => constraint.field);
  return `from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from validation import validate_features


VALID_FEATURES = ${pythonLiteral(valid)}
INVALID_CASES = ${pythonLiteral(cases)}
BOOL_REJECTION_FIELDS = ${pythonLiteral(boolCases)}


class TestInputValidation(unittest.TestCase):
    def test_validate_features_accepts_valid_inputs(self):
        self.assertEqual(validate_features(dict(VALID_FEATURES)), VALID_FEATURES)

    def test_validate_features_rejects_invalid_constraints(self):
        for case in INVALID_CASES:
            with self.subTest(field=case["field"]):
                features = dict(VALID_FEATURES)
                features[case["field"]] = case["invalid"]
                with self.assertRaises(ValueError):
                    validate_features(features)

    def test_validate_features_rejects_bool_as_number(self):
        for field in BOOL_REJECTION_FIELDS:
            with self.subTest(field=field):
                features = dict(VALID_FEATURES)
                features[field] = True
                with self.assertRaises(ValueError):
                    validate_features(features)


if __name__ == "__main__":
    unittest.main()
`;
}

function inferencePy(decision) {
  const classifier = decision.task_type === "classification";
  return `import joblib
import pandas as pd

from validation import validate_features


def predict(input_rows, model_path="artifacts/model.joblib"):
    validated = [validate_features(dict(row)) for row in input_rows]
    pipeline = joblib.load(model_path)
    frame = pd.DataFrame(validated)
${classifier ? `    scores = pipeline.predict_proba(frame)[:, 1]
    return [{"score": float(score), "label": int(score >= 0.5)} for score in scores]` : `    predictions = pipeline.predict(frame)
    return [{"prediction": float(value)} for value in predictions]`}
`;
}

function metricImport(decision, classifier) {
  if (!classifier) return "mean_absolute_error, mean_squared_error, r2_score";
  return decision.primary_metric === "average_precision"
    ? "average_precision_score, classification_report"
    : "classification_report, roc_auc_score";
}

function metricPrint(decision) {
  if (decision.primary_metric === "average_precision") {
    return `    if hasattr(pipeline, "predict_proba") and y.nunique(dropna=True) == 2:
        scores = pipeline.predict_proba(X_test)[:, 1]
        print("average_precision:", average_precision_score(y_test, scores))
    predictions = pipeline.predict(X_test)
    print(classification_report(y_test, predictions))`;
  }
  return `    if hasattr(pipeline, "predict_proba") and y.nunique(dropna=True) == 2:
        scores = pipeline.predict_proba(X_test)[:, 1]
        print("ROC-AUC:", roc_auc_score(y_test, scores))
    predictions = pipeline.predict(X_test)
    print(classification_report(y_test, predictions))`;
}

function temporalSplitBlock(decision) {
  const dateColumns = dateLikeFeatures(decision.features || []);
  const dateColumn = dateColumns[0] || "date";
  return `    if ${JSON.stringify(dateColumn)} in X.columns:
        order = X[${JSON.stringify(dateColumn)}].sort_values().index
        X = X.loc[order]
        y = y.loc[order]
    splitter = TimeSeriesSplit(n_splits=5)
    train_idx, test_idx = list(splitter.split(X))[-1]
    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]`;
}

function randomSplitBlock(classifier) {
  return `    stratify = y if ${classifier ? "True" : "False"} and y.nunique(dropna=True) > 1 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=stratify
    )`;
}

function supervisedTrainPy(profile, taskKey, decision) {
  const target = decision?.target || profile.inferred?.target || "target";
  const classifier = taskKey === "classification";
  const temporal = decision?.split_strategy === "temporal";
  return `from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import HistGradientBoosting${classifier ? "Classifier" : "Regressor"}
from sklearn.metrics import ${metricImport(decision || {}, classifier)}
from sklearn.model_selection import ${temporal ? "TimeSeriesSplit" : "train_test_split"}
from sklearn.pipeline import Pipeline

from preprocessing import CATEGORICAL_FEATURES, EXCLUDED_FEATURES, NUMERIC_FEATURES, build_preprocessor


DATA_PATH = Path("data/training.csv")
TARGET = ${JSON.stringify(target)}
ARTIFACT_PATH = Path("artifacts/model.joblib")


def feature_columns(frame):
    configured = NUMERIC_FEATURES + CATEGORICAL_FEATURES
    if configured:
        return configured
    excluded = set(EXCLUDED_FEATURES + [TARGET])
    return [column for column in frame.columns if column not in excluded]


def main():
    frame = pd.read_csv(DATA_PATH)
    if TARGET not in frame.columns:
        raise ValueError(f"Target column {TARGET!r} not found in {DATA_PATH}.")

    columns = feature_columns(frame)
    X = frame[columns]
    y = frame[TARGET]
${temporal ? temporalSplitBlock(decision || {}) : randomSplitBlock(classifier)}

    model = HistGradientBoosting${classifier ? "Classifier" : "Regressor"}(max_iter=250, learning_rate=0.06)
    pipeline = Pipeline([("preprocess", build_preprocessor()), ("model", model)])
    pipeline.fit(X_train, y_train)
    ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, ARTIFACT_PATH)

${classifier ? metricPrint(decision || {}) : `    predictions = pipeline.predict(X_test)
    print("MAE:", mean_absolute_error(y_test, predictions))
    print("RMSE:", mean_squared_error(y_test, predictions, squared=False))
    print("R2:", r2_score(y_test, predictions))`}


if __name__ == "__main__":
    main()
`;
}

function genericSupervisedTrainPy(decision) {
  const classifier = decision.task_type === "classification";
  const temporal = decision.split_strategy === "temporal";
  return `from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoosting${classifier ? "Classifier" : "Regressor"}
from sklearn.impute import SimpleImputer
from sklearn.metrics import ${metricImport(decision, classifier)}
from sklearn.model_selection import ${temporal ? "TimeSeriesSplit" : "train_test_split"}
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


DATA_PATH = Path("data/training.csv")
TARGET = ${JSON.stringify(decision.target || "target")}
FEATURES = ${JSON.stringify(decision.features || [], null, 4)}
ARTIFACT_PATH = Path("artifacts/model.joblib")


def feature_columns(frame):
    configured = [column for column in FEATURES if column in frame.columns and column != TARGET]
    if configured:
        return configured
    return [column for column in frame.columns if column != TARGET]


def main():
    frame = pd.read_csv(DATA_PATH)
    if TARGET not in frame.columns:
        raise ValueError(f"Target column {TARGET!r} not found in {DATA_PATH}.")

    columns = feature_columns(frame)
    X = frame[columns]
    y = frame[TARGET]
${temporal ? temporalSplitBlock(decision) : randomSplitBlock(classifier)}

    preprocess = ColumnTransformer([
        ("cat", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")), ("encoder", OneHotEncoder(handle_unknown="ignore"))]), columns)
    ], remainder="drop")
    model = HistGradientBoosting${classifier ? "Classifier" : "Regressor"}(max_iter=250, learning_rate=0.06)
    pipeline = Pipeline([("preprocess", preprocess), ("model", model)])
    pipeline.fit(X_train, y_train)
    ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, ARTIFACT_PATH)

${classifier ? metricPrint(decision) : `    predictions = pipeline.predict(X_test)
    print("MAE:", mean_absolute_error(y_test, predictions))
    print("RMSE:", mean_squared_error(y_test, predictions, squared=False))
    print("R2:", r2_score(y_test, predictions))`}


if __name__ == "__main__":
    main()
`;
}

function datasetReadme(profile) {
  const warnings = [...(profile.leakage_warnings || []), ...(profile.quality_warnings || [])];
  return `# Dataset Profile

Source file: ${profile.filename}

- Rows: ${profile.row_count}
- Columns: ${profile.column_count}
- Inferred task: ${profile.inferred?.task_type || "unknown"}
- Inferred target: ${profile.inferred?.target || "none"}

## Feature Groups

- Numeric: ${(profile.inferred?.numeric_features || []).join(", ") || "none"}
- Categorical: ${(profile.inferred?.categorical_features || []).join(", ") || "none"}
- Text: ${(profile.inferred?.text_features || []).join(", ") || "none"}
- Dates: ${(profile.inferred?.date_columns || []).join(", ") || "none"}
- Excluded: ${(profile.inferred?.excluded_features || []).join(", ") || "none"}

## Warnings

${warnings.map((warning) => `- ${warning.column}: ${warning.reason}`).join("\n") || "- No major warnings detected by the lightweight profiler."}

## Executable Checks

${(profile.executable_checks || [])
  .map((check) => `- ${check.kind}: ${check.executable_consequence}`)
  .join("\n") || "- No executable checks were available for this dataset/task."}
`;
}

function executableSummary(profile) {
  const check = profile?.executable_checks?.[0];
  if (!check) return null;
  if (check.kind === "classification_majority_baseline") {
    return `Majority baseline: ${check.majority_accuracy} accuracy, minority recall ${check.minority_recall}, macro recall ${check.macro_recall}.`;
  }
  if (check.kind.includes("regression")) {
    return `Constant baseline: mean MAE ${check.mean_baseline_mae}, median MAE ${check.median_baseline_mae}, mean RMSE ${check.mean_baseline_rmse}.`;
  }
  if (check.kind.includes("forecasting")) {
    return `Naive previous-value baseline MAE: ${check.naive_previous_value_mae}.`;
  }
  return check.executable_consequence;
}

function confidenceValue(label) {
  return String(label || "").toLowerCase().startsWith("high") ? "high" : "medium";
}

function metricForTask(taskKey) {
  if (taskKey === "classification") return { objective: "cross_entropy", primary_metric: "ROC-AUC" };
  if (taskKey === "regression") return { objective: "mean_squared_error", primary_metric: "MAE" };
  if (taskKey === "forecasting") return { objective: "forecast_error", primary_metric: "MAPE" };
  if (taskKey === "recommendation") return { objective: "ranking_loss", primary_metric: "NDCG" };
  return { objective: "inertia", primary_metric: "silhouette" };
}

export function resolveTask({ idea = "", task = "auto", datasetProfile = null, claims = parseIdeaClaims(idea) } = {}) {
  if (datasetProfile?.inferred?.task_type) return datasetProfile.inferred.task_type;
  if (task !== "auto") return task;
  const detected = detectTask(idea);
  if (claims.task_guess === "recommendation" && detected === "classification") return "classification";
  return claims.task_guess || detected;
}

export function buildDraftDecision({ idea = "", taskKey = "classification", datasetProfile = null, blueprint = BLUEPRINTS[taskKey] || BLUEPRINTS.classification, claims = parseIdeaClaims(idea) } = {}) {
  const metric = metricForTask(taskKey);
  const inferred = datasetProfile?.inferred || {};
  const features = datasetProfile
    ? [
        ...(inferred.numeric_features || []),
        ...(inferred.categorical_features || []),
        ...(inferred.text_features || []),
        ...(inferred.date_columns || [])
      ]
    : claims.resolved_features || claims.named_columns || [];
  const target = datasetProfile
    ? inferred.target
    : claims.resolved_target || (claims.named_columns?.length ? null : claims.target_phrase) || "target";
  return {
    task_type: taskKey,
    objective: claims.stated_objective === "accuracy" ? "accuracy" : metric.objective,
    primary_metric: claims.stated_objective === "accuracy" ? "accuracy" : metric.primary_metric,
    split_strategy: claims.stated_split || (taskKey === "forecasting" ? "temporal" : "random"),
    features: Array.from(new Set(features.filter(Boolean))),
    target: target || "target",
    confidence: confidenceValue(blueprint.confidence)
  };
}

function displayConfidence(decision, blueprint) {
  if (decision.confidence === "needs_resolution") return "Needs resolution";
  if (decision.confidence === "medium") return "Medium confidence";
  if (decision.confidence === "low") return "low";
  return blueprint.confidence;
}

function displaySignals(decision) {
  return [decision.task_type, decision.objective, decision.primary_metric];
}

function decisionSummaryLine(decision) {
  return `Optimize ${decision.objective} and report ${decision.primary_metric} with a ${decision.split_strategy} split.`;
}

function consequenceSummary(consequences) {
  if (!consequences?.blocking?.length) return {};
  return {
    "Blocking consequences": consequences.blocking.map((item) => item.message).join(" ")
  };
}

const VERDICT_SEVERITY = {
  ok: 0,
  warn: 1,
  needs_component_resolution: 1,
  needs_resolution: 2,
  blocked: 3
};

function reconcileVerdicts(systemVerdict = "ok", componentVerdict = "ok") {
  const systemRank = VERDICT_SEVERITY[systemVerdict] ?? 0;
  const componentRank = VERDICT_SEVERITY[componentVerdict] ?? 0;
  return componentRank > systemRank ? componentVerdict : systemVerdict;
}

function applyDatasetAwareness({ files, summary, dataContract, modelPath, taskKey, datasetProfile, decision }) {
  if (!datasetProfile) {
    const awareFiles = { ...files };
    if (["classification", "regression"].includes(taskKey)) {
      awareFiles["train.py"] = genericSupervisedTrainPy(decision);
      awareFiles["preprocessing.py"] = noProfilePreprocessingPy(decision);
      awareFiles["schema.yaml"] = decisionSchema(decision);
    }
    if (decision.requires_input_validation) {
      awareFiles["validation.py"] = inputValidationPy(decision);
      awareFiles["inference.py"] = inferencePy(decision);
      awareFiles["test_input_validation.py"] = inputValidationTestsPy(decision);
    }
    return {
      files: awareFiles,
      summary: {
        ...summary,
        "Optimization": decisionSummaryLine(decision)
      },
      dataContract: [
        `Target: ${decision.target || "not specified"}.`,
        `Features to use: ${(decision.features || []).join(", ") || "confirm with dataset schema"}.`,
        `Split strategy: ${decision.split_strategy}.`,
        ...dataContract
      ],
      modelPath: [
        `Use ${decision.split_strategy} validation and ${decision.primary_metric} as the primary metric.`,
        ...modelPath
      ]
    };
  }
  const inferred = datasetProfile.inferred || {};
  const awareFiles = {
    ...files,
    "schema.yaml": datasetSchema(datasetProfile, decision),
    "preprocessing.py": preprocessingPy(datasetProfile, decision),
    "DATASET_PROFILE.md": datasetReadme(datasetProfile)
  };
  if (["classification", "regression"].includes(taskKey)) {
    awareFiles["train.py"] = supervisedTrainPy(datasetProfile, taskKey, decision);
  }
  if (decision.requires_input_validation) {
    awareFiles["validation.py"] = inputValidationPy(decision);
    awareFiles["inference.py"] = inferencePy(decision);
    awareFiles["test_input_validation.py"] = inputValidationTestsPy(decision);
  }
  return {
    files: awareFiles,
    summary: {
      ...summary,
      "Optimization": decisionSummaryLine(decision),
      "Dataset profile": `${datasetProfile.row_count} rows, ${datasetProfile.column_count} columns. Target candidate: ${inferred.target || "not detected"}.`,
      ...(executableSummary(datasetProfile) ? { "Executable check": executableSummary(datasetProfile) } : {})
    },
    dataContract: [
      `Target column: ${inferred.target || "not detected"}.`,
      `Numeric features: ${(inferred.numeric_features || []).join(", ") || "none detected"}.`,
      `Categorical features: ${(inferred.categorical_features || []).join(", ") || "none detected"}.`,
      `Date columns: ${(inferred.date_columns || []).join(", ") || "none detected"}.`,
      `Excluded ID/high-cardinality columns: ${(inferred.excluded_features || []).join(", ") || "none detected"}.`,
      `Corrected split strategy: ${decision.split_strategy}.`,
      `Primary metric: ${decision.primary_metric}.`
    ],
    modelPath: [
      `Load data from ${datasetProfile.filename || "uploaded CSV"} and validate schema.yaml.`,
      `Use target column ${inferred.target || "after manual confirmation"}.`,
      `Evaluate with ${decision.primary_metric} using a ${decision.split_strategy} split.`,
      "Apply generated preprocessing.py feature groups.",
      ...modelPath
    ]
  };
}

export function buildAgentSpec({
  blueprint,
  taskKey,
  idea,
  audience,
  files,
  decision,
  consequences,
  generatedQuestions,
  gateAnswers,
  datasetProfile,
  retrievedKnowledge,
  projectComplexity,
  decisionTrace,
  componentConsequences
}) {
  return {
    product: "ModelBlueprint",
    engine_name: "MILLE",
    project_type: projectComplexity?.projectType || "single_task",
    task_type: taskKey,
    idea: String(idea || "").trim(),
    audience,
    decision,
    decision_trace: decisionTrace || [],
    components: projectComplexity?.recommendedComponents || [],
    candidate_components: projectComplexity?.candidateComponents || [],
    component_consequences: componentConsequences,
    consequences,
    gate_answers: gateAnswers || {},
    gate_resolution: decision.gate_resolution || null,
    generated_questions: generatedQuestions,
    problem_framing: blueprint.summary["Problem framing"],
    recommended_models: blueprint.path,
    math: blueprint.formulas.map((item) => ({
      name: item.title,
      type: item.tag,
      formula: item.formula,
      purpose: item.note
    })),
    data_contract: blueprint.data,
    dataset_profile: datasetProfile,
    implementation_files: Object.keys(files),
    retrieved_knowledge: retrievedKnowledge.map((entry) => ({
      id: entry.id,
      title: entry.title,
      type: entry.type,
      source: entry.source.url,
      retrieval_method: entry.retrieval_method,
      relevance: entry.relevance,
      semantic_score: entry.semantic_score,
      keyword_score: entry.keyword_score
    })),
    acceptance_criteria: [
      "Training pipeline runs from a single command.",
      "Evaluation metrics are printed and saved.",
      "Preprocessing is reused for inference.",
      "README explains target, features, metrics, and deployment path.",
      "Tests validate schema and leakage assumptions.",
      "Agent preflight reads consequence files before implementation.",
      "Blocking consequences are resolved or explicitly accepted before deployment."
    ]
  };
}

function assembleBlueprint({ idea, task, audience, retrievedKnowledge, datasetProfile = null, gateAnswers = {} }) {
  const claims = parseIdeaClaims(idea);
  const taskKey = resolveTask({ idea, task, datasetProfile, claims });
  const blueprint = BLUEPRINTS[taskKey] || BLUEPRINTS.classification;
  const projectComplexity = detectProjectComplexity({ idea, selectedTask: task, datasetProfile });
  const draft = buildDraftDecision({ idea, taskKey, datasetProfile, blueprint, claims });
  const consequenceResult = evaluateBlueprint({ claims, profile: datasetProfile, draft, gateAnswers });
  const { decision } = consequenceResult;
  const multiComponent = projectComplexity.projectType === "multi_component_system";
  const componentConsequences = multiComponent
    ? evaluateComponentConsequences({ components: projectComplexity.recommendedComponents })
    : { verdict: "ok", by_component: {}, blocking: [], all: [], generated_questions: [] };
  const generatedQuestions = [
    ...consequenceResult.generated_questions,
    ...componentConsequences.generated_questions
  ];
  const systemVerdict = reconcileVerdicts(consequenceResult.verdict, componentConsequences.verdict);
  const decisionTrace = [
    ...projectComplexity.decision_trace,
    `Single-task candidate: ${taskKey}.`,
    `Verdict reconciliation: system=${consequenceResult.verdict}, components=${componentConsequences.verdict} -> overall=${systemVerdict} (max_by_severity).`
  ];
  const datasetAware = applyDatasetAwareness({
    files: getFiles(blueprint),
    summary: { ...blueprint.summary },
    dataContract: blueprint.data,
    modelPath: blueprint.path,
    taskKey,
    datasetProfile,
    decision
  });

  if (audience === "business") {
    datasetAware.summary["Decision output"] = "A blueprint an ML engineer or coding agent can convert into an implementation plan.";
  } else {
    datasetAware.summary["Technical constraint"] = "Keep preprocessing, training, evaluation, and inference in one reproducible pipeline.";
  }

  if (multiComponent) {
    datasetAware.summary["System architecture"] =
      `Detected a multi-component ML system with ${projectComplexity.recommendedComponents.length} components: ${projectComplexity.recommendedComponents
        .map((component) => `${component.name} (${component.task_type})`)
        .join(", ")}.`;
    datasetAware.summary["Single-task override"] = projectComplexity.explanation;
    datasetAware.modelPath = [
      "Treat this as a multi-component ML/optimization system, not one isolated model.",
      "Implement each component with its own target, metrics, data contract, and acceptance tests.",
      "Wire prediction components into optimization, API, and dashboard components through explicit schemas.",
      ...projectComplexity.recommendedComponents.map(
        (component) => `${component.name}: ${component.objective}; metrics ${component.metrics.join(", ")}.`
      )
    ];
    datasetAware.dataContract = [
      "Create a system-level data contract plus per-component contracts.",
      "Define shared entity IDs, timestamps, update cadence, and ownership boundaries.",
      ...projectComplexity.recommendedComponents.map(
        (component) => `${component.name}: needs ${component.data_needs.join(", ")}.`
      )
    ];
  }

  const agentSpec = {
    ...buildAgentSpec({
      blueprint,
      taskKey,
      idea,
      audience,
      files: datasetAware.files,
      decision,
      consequences: {
        verdict: systemVerdict,
        blocking: consequenceResult.blocking,
        resolved: consequenceResult.resolved,
        accepted: consequenceResult.accepted,
        all: consequenceResult.all
      },
      generatedQuestions,
      gateAnswers,
      datasetProfile,
      retrievedKnowledge,
      projectComplexity,
      decisionTrace,
      componentConsequences
    }),
    problem_framing: datasetAware.summary["Problem framing"],
    recommended_models: datasetAware.modelPath,
    data_contract: datasetAware.dataContract,
    implementation_files: Object.keys(datasetAware.files)
  };

  return {
    title: titleFromIdea(idea, blueprint),
    engine_name: "MILLE",
    project_type: projectComplexity.projectType,
    task_type: taskKey,
    audience,
    confidence: systemVerdict === "needs_resolution" ? "Needs resolution" : displayConfidence(decision, blueprint),
    signals: displaySignals(decision),
    summary: {
      ...datasetAware.summary,
      ...consequenceSummary(consequenceResult),
      ...(componentConsequences.blocking.length
        ? {
            "Component gates":
              `${componentConsequences.blocking.length} blocking component gate(s) must be resolved before implementation.`
          }
        : {})
    },
    data_contract: datasetAware.dataContract,
    model_path: datasetAware.modelPath,
    formulas: blueprint.formulas,
    retrieved_knowledge: retrievedKnowledge,
    embedding_index: embeddingIndexStatus(),
    dataset_profile: datasetProfile,
    claims,
    decision,
    decision_trace: decisionTrace,
    project_complexity: projectComplexity,
    components: projectComplexity.recommendedComponents,
    component_consequences: componentConsequences,
    consequences: {
      verdict: systemVerdict,
      blocking: consequenceResult.blocking,
      resolved: consequenceResult.resolved,
      accepted: consequenceResult.accepted,
      all: consequenceResult.all
    },
    gate_answers: gateAnswers || {},
    gate_resolution: decision.gate_resolution || null,
    generated_questions: generatedQuestions,
    files: datasetAware.files,
    project_tree: buildProjectTreeFromFiles(Object.keys(datasetAware.files)),
    agent_spec: agentSpec
  };
}

export function generateBlueprint({ idea = "", task = "auto", audience = "business", dataset_profile = null, gate_answers = {} } = {}) {
  const claims = parseIdeaClaims(idea);
  const taskKey = resolveTask({ idea, task, datasetProfile: dataset_profile, claims });
  return assembleBlueprint({
    idea,
    task,
    audience,
    datasetProfile: dataset_profile,
    gateAnswers: gate_answers,
    retrievedKnowledge: retrieveKnowledge({ idea, taskType: taskKey, limit: 5 })
  });
}

export async function generateBlueprintAsync({ idea = "", task = "auto", audience = "business", dataset_profile = null, gate_answers = {} } = {}) {
  const claims = parseIdeaClaims(idea);
  const taskKey = resolveTask({ idea, task, datasetProfile: dataset_profile, claims });
  return assembleBlueprint({
    idea,
    task,
    audience,
    datasetProfile: dataset_profile,
    gateAnswers: gate_answers,
    retrievedKnowledge: await retrieveKnowledgeSemantic({ idea, taskType: taskKey, limit: 5 })
  });
}
