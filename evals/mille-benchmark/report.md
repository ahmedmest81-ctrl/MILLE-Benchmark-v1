# MILLE Benchmark Report

Provider: local-engine
Generated: 2026-07-06T19:47:19.894Z
Overall: PASS

## Gate Checks

| Metric | Value | Threshold | Result |
| --- | ---: | ---: | --- |
| overall_score | 95.8% | 85.0% | pass |
| contract_pass_rate | 100.0% | 100.0% | pass |
| task_correctness_rate | 98.0% | 95.0% | pass |
| must_have_coverage | 99.3% | 90.0% | pass |
| failure_avoidance | 95.8% | 95.0% | pass |
| hard_case_score | 96.7% | 75.0% | pass |

## Score By Task

| Task | Records | Score |
| --- | ---: | ---: |
| classification | 50 | 98.1% |
| clustering | 20 | 80.0% |
| forecasting | 35 | 100.0% |
| multi_component_system | 35 | 91.4% |
| recommendation | 25 | 100.0% |
| regression | 35 | 98.9% |

## Score By Domain

| Domain | Records | Score |
| --- | ---: | ---: |
| ads | 1 | 85.0% |
| banking | 14 | 96.4% |
| commerce | 5 | 100.0% |
| customer_support | 13 | 98.1% |
| education | 11 | 94.5% |
| energy | 13 | 98.5% |
| finance | 9 | 93.3% |
| fintech | 1 | 95.0% |
| fleet | 1 | 95.0% |
| healthcare | 17 | 95.0% |
| hr | 1 | 80.0% |
| insurance | 9 | 97.8% |
| legal_ops | 4 | 100.0% |
| logistics | 13 | 97.3% |
| manufacturing | 12 | 92.9% |
| marketing | 5 | 99.0% |
| media | 4 | 100.0% |
| payments | 5 | 100.0% |
| real_estate | 5 | 100.0% |
| retail | 17 | 98.8% |
| saas | 9 | 99.4% |
| security | 13 | 80.0% |
| supply_chain | 7 | 100.0% |
| telecom | 11 | 94.5% |

## Top Failed Checks

| Check | Count |
| --- | ---: |
| should_have_rubric | 58 |
| failure_avoidance | 25 |
| must_have_rubric | 6 |
| task_correctness | 4 |

## Worst Records

| Record | Task | Domain | Score |
| --- | --- | --- | ---: |
| generated_multi_component_006 | multi_component_system | security | 60.0% |
| generated_multi_component_014 | multi_component_system | security | 60.0% |
| generated_multi_component_022 | multi_component_system | security | 60.0% |
| generated_multi_component_030 | multi_component_system | security | 60.0% |
| credit_default_001 | classification | banking | 65.0% |
| claims_severity_001 | regression | insurance | 80.0% |
| security_anomaly_001 | clustering | security | 80.0% |
| hr_attrition_001 | classification | hr | 80.0% |
| generated_clustering_001 | clustering | security | 80.0% |
| generated_clustering_002 | clustering | manufacturing | 80.0% |

## Recommended Next Fixes

- Start with the most frequent failed checks above and inspect the listed worst records.
- Keep record-level JSON results for exact check details.
