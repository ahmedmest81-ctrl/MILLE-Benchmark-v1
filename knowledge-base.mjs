export const KNOWLEDGE_BASE = [
  {
    id: "sklearn-metric-choice",
    type: "evaluation",
    title: "Choose metrics from the decision goal",
    task_tags: ["classification", "regression", "forecasting"],
    keywords: ["metric", "score", "evaluate", "business", "decision", "classification", "regression", "forecast"],
    summary:
      "Model evaluation should match the prediction target and the decision the model supports. For classifiers, probability outputs are often needed for probability-aware metrics; for regressors, squared error, absolute error, and quantile losses answer different business questions.",
    formula: "metric = function(y_true, y_pred_or_score)",
    implementation:
      "Select metrics before training. Use probability scores for ROC-AUC, log loss, calibration, and threshold tuning; use point predictions for MAE, RMSE, R2, and residual analysis.",
    assumptions: [
      "The target and decision objective are clear.",
      "The evaluation split reflects deployment conditions.",
      "The metric penalizes the mistakes the business actually cares about."
    ],
    pitfalls: [
      "Accuracy alone can hide poor minority-class performance.",
      "Optimizing a metric that is not aligned with the operating decision creates misleading model comparisons."
    ],
    source: {
      label: "scikit-learn model evaluation",
      url: "https://scikit-learn.org/stable/modules/model_evaluation.html"
    }
  },
  {
    id: "classification-probability-metrics",
    type: "metric",
    title: "Classification probability metrics",
    task_tags: ["classification"],
    keywords: ["classification", "binary", "probability", "roc", "auc", "log loss", "precision", "recall", "f1", "threshold", "fraud", "churn"],
    summary:
      "Binary classification systems should usually evaluate both ranking quality and operating-threshold behavior. ROC-AUC summarizes ranking across thresholds, while precision and recall describe the chosen decision threshold.",
    formula: "precision = TP / (TP + FP), recall = TP / (TP + FN)",
    implementation:
      "Train a probabilistic classifier, report ROC-AUC and average precision, then tune the threshold using precision, recall, F1, or expected cost.",
    assumptions: [
      "Positive and negative classes are defined consistently.",
      "Predicted probabilities or decision scores are available.",
      "The validation class distribution is representative or explicitly reweighted."
    ],
    pitfalls: [
      "Threshold 0.5 is often arbitrary.",
      "ROC-AUC can look strong even when precision at the deployed threshold is weak under severe class imbalance."
    ],
    source: {
      label: "scikit-learn classification scoring",
      url: "https://scikit-learn.org/stable/modules/model_evaluation.html#classification-metrics"
    }
  },
  {
    id: "classification-log-loss",
    type: "loss",
    title: "Log loss for probabilistic classification",
    task_tags: ["classification"],
    keywords: ["classification", "log loss", "cross entropy", "probability", "predict_proba", "calibration", "binary"],
    summary:
      "Log loss, also called cross entropy in many ML contexts, evaluates the quality of predicted probabilities and penalizes confident wrong predictions strongly.",
    formula: "L = -1/N * sum[y log(p) + (1-y) log(1-p)]",
    implementation:
      "Use models that expose probability scores when probability quality matters. Add calibration checks when probabilities drive business decisions.",
    assumptions: [
      "Labels are encoded consistently.",
      "Predicted probabilities are bounded away from exactly 0 and 1 in implementation.",
      "Probability calibration matters for downstream actions."
    ],
    pitfalls: [
      "Low log loss does not choose the deployment threshold by itself.",
      "Poorly calibrated probabilities can produce bad decisions even when rank metrics are acceptable."
    ],
    source: {
      label: "scikit-learn log loss scorer",
      url: "https://scikit-learn.org/stable/modules/model_evaluation.html"
    }
  },
  {
    id: "regression-error-metrics",
    type: "metric",
    title: "Regression error metrics",
    task_tags: ["regression", "forecasting"],
    keywords: ["regression", "forecast", "mae", "mse", "rmse", "squared error", "absolute error", "price", "revenue", "demand"],
    summary:
      "For numeric prediction, squared error emphasizes large misses while absolute error is easier to interpret in the original target unit and is less dominated by outliers.",
    formula: "MSE = mean((y - y_hat)^2), MAE = mean(|y - y_hat|)",
    implementation:
      "Report MAE for interpretability, RMSE for large-error sensitivity, and residual slices by important business segments.",
    assumptions: [
      "Target values are numeric and comparable across rows.",
      "Outliers are either valid events or handled explicitly.",
      "Train/test split reflects future prediction conditions."
    ],
    pitfalls: [
      "R2 alone is not enough for operational tolerances.",
      "MAPE is unstable when true values can be zero or near zero."
    ],
    source: {
      label: "scikit-learn regression scoring",
      url: "https://scikit-learn.org/stable/modules/model_evaluation.html#regression-metrics"
    }
  },
  {
    id: "safe-pipelines",
    type: "implementation",
    title: "Pipeline and ColumnTransformer for leakage-safe preprocessing",
    task_tags: ["classification", "regression", "forecasting", "clustering"],
    keywords: ["pipeline", "preprocess", "columntransformer", "leakage", "numeric", "categorical", "onehot", "scaler", "imputer"],
    summary:
      "Put preprocessing and modeling in a single pipeline so fitted preprocessing statistics are learned only from training data and reused consistently at inference time.",
    formula: "pipeline = preprocess -> model",
    implementation:
      "Use ColumnTransformer for different numeric, categorical, and text transformations; wrap it with the estimator in a Pipeline.",
    assumptions: [
      "Input columns are known at train and inference time.",
      "Preprocessing must be fit only on training folds.",
      "The same transformations are required during inference."
    ],
    pitfalls: [
      "Fitting scalers or imputers before the train/test split leaks information.",
      "Ad hoc preprocessing in notebooks often diverges from production inference."
    ],
    source: {
      label: "scikit-learn Pipeline and ColumnTransformer",
      url: "https://scikit-learn.org/stable/modules/compose.html"
    }
  },
  {
    id: "time-series-validation",
    type: "validation",
    title: "Time-series validation must respect time order",
    task_tags: ["forecasting"],
    keywords: ["forecast", "time series", "timeseries", "future", "backtest", "rolling", "timeseriessplit", "sales", "demand", "traffic"],
    summary:
      "Time-series observations near each other are autocorrelated, so random K-fold or shuffled splits can leak future-like information into training. Use future holdouts or rolling-origin validation.",
    formula: "train: [1..t], test: [t+1..t+h]",
    implementation:
      "Use TimeSeriesSplit or explicit backtest windows. Create lag and rolling features with shift so every feature is available at prediction time.",
    assumptions: [
      "Rows are ordered by a reliable timestamp.",
      "The forecast horizon is defined.",
      "Evaluation windows are comparable in duration."
    ],
    pitfalls: [
      "Random train/test splits overestimate forecasting performance.",
      "Rolling features that include the current or future target create leakage."
    ],
    source: {
      label: "scikit-learn TimeSeriesSplit",
      url: "https://scikit-learn.org/stable/modules/cross_validation.html#time-series-split"
    }
  },
  {
    id: "kmeans-inertia",
    type: "model",
    title: "K-means minimizes within-cluster sum of squares",
    task_tags: ["clustering"],
    keywords: ["cluster", "clustering", "segment", "kmeans", "k-means", "inertia", "persona", "group"],
    summary:
      "K-means separates samples into a specified number of clusters by minimizing inertia, also known as within-cluster sum of squares.",
    formula: "J = sum_k sum_{x in C_k} ||x - mu_k||^2",
    implementation:
      "Scale numeric features, search over plausible cluster counts, and inspect cluster profiles before treating assignments as business segments.",
    assumptions: [
      "The number of clusters is chosen or searched.",
      "Euclidean geometry is meaningful after preprocessing.",
      "Clusters are reasonably compact and similarly scaled."
    ],
    pitfalls: [
      "K-means requires the number of clusters up front.",
      "It can perform poorly on irregular, density-shaped, or highly imbalanced clusters."
    ],
    source: {
      label: "scikit-learn K-means",
      url: "https://scikit-learn.org/stable/modules/clustering.html#k-means"
    }
  },
  {
    id: "silhouette-score",
    type: "metric",
    title: "Silhouette score for unlabeled clustering",
    task_tags: ["clustering"],
    keywords: ["cluster", "clustering", "silhouette", "segment", "unsupervised", "validation", "kmeans"],
    summary:
      "When ground-truth cluster labels are not known, silhouette score evaluates how close points are to their own cluster compared with the nearest other cluster.",
    formula: "s = (b - a) / max(a, b)",
    implementation:
      "Compute silhouette scores for several cluster counts and pair the score with human interpretation of cluster profiles.",
    assumptions: [
      "Distances reflect meaningful similarity.",
      "Clusters are dense and separated enough for distance-based validation.",
      "The clustering algorithm returns labels for samples."
    ],
    pitfalls: [
      "Silhouette tends to prefer convex, well-separated clusters.",
      "A high score does not guarantee clusters are useful for business action."
    ],
    source: {
      label: "scikit-learn Silhouette Coefficient",
      url: "https://scikit-learn.org/stable/modules/clustering.html#silhouette-coefficient"
    }
  },
  {
    id: "recommendation-two-stage",
    type: "architecture",
    title: "Recommendation systems often use retrieval then ranking",
    task_tags: ["recommendation"],
    keywords: ["recommend", "recommendation", "ranking", "retrieval", "candidate", "personalize", "products", "movies", "items"],
    summary:
      "Large recommender systems commonly use a retrieval stage to efficiently select candidate items, then a ranking stage to refine that candidate set into the final recommendations.",
    formula: "score(user, item) = embedding_user dot embedding_item",
    implementation:
      "Start with popularity and item-similarity baselines. For richer data, use two-tower retrieval with user and item embeddings, then add a ranking model if needed.",
    assumptions: [
      "User-item interaction data exists.",
      "Items can be represented by IDs and metadata.",
      "Serving latency matters when the item catalog is large."
    ],
    pitfalls: [
      "Offline ranking metrics can disagree with online engagement.",
      "Cold-start users and items need metadata or popularity fallbacks."
    ],
    source: {
      label: "TensorFlow Recommenders retrieval tutorial",
      url: "https://www.tensorflow.org/recommenders/examples/basic_retrieval"
    }
  },
  {
    id: "recommendation-workflow",
    type: "implementation",
    title: "Recommender workflow: data, model, evaluation, deployment",
    task_tags: ["recommendation"],
    keywords: ["recommend", "recommender", "user", "item", "context", "multi-task", "evaluation", "deployment"],
    summary:
      "A recommendation workflow needs data preparation, model formulation, training, evaluation, and deployment. User, item, and context features can all be incorporated.",
    formula: "recommendations = top_k(score(user, candidate_items))",
    implementation:
      "Track user_id, item_id, event type, timestamp, and optional context. Evaluate top-k quality and prepare serving indexes for retrieval.",
    assumptions: [
      "Historical events are meaningful signals of preference.",
      "Training data has timestamps for leakage-aware evaluation.",
      "The candidate catalog is available at serving time."
    ],
    pitfalls: [
      "Treating all missing interactions as negative can bias learning.",
      "Recommendation loops can reinforce popularity bias without diversity checks."
    ],
    source: {
      label: "TensorFlow Recommenders overview",
      url: "https://www.tensorflow.org/recommenders"
    }
  }
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "i",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "use",
  "using",
  "want",
  "with"
]);

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#-]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function knowledgeDocumentText(entry) {
  return [
    entry.title,
    entry.type,
    entry.summary,
    entry.formula,
    entry.implementation,
    entry.task_tags.join(" "),
    entry.keywords.join(" "),
    entry.assumptions.join(" "),
    entry.pitfalls.join(" ")
  ].join(" ");
}

export function retrieveKnowledgeByKeyword({ idea = "", taskType = "classification", limit = 5 } = {}) {
  const queryTokens = tokenize(`${idea} ${taskType}`);
  const querySet = new Set(queryTokens);

  return KNOWLEDGE_BASE.map((entry) => {
    const entryTokens = tokenize(knowledgeDocumentText(entry));
    const keywordSet = new Set(entry.keywords.map((keyword) => keyword.toLowerCase()));
    let score = entry.task_tags.includes(taskType) ? 4 : 0;

    for (const token of querySet) {
      if (keywordSet.has(token)) score += 3;
      score += entryTokens.includes(token) ? 1 : 0;
    }

    return {
      ...entry,
      score
    };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map(({ score, ...entry }) => ({
      ...entry,
      relevance: score,
      keyword_score: score,
      semantic_score: null,
      retrieval_method: "keyword"
    }));
}

export const retrieveKnowledge = retrieveKnowledgeByKeyword;
