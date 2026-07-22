# SLMA CE V2 Final Model Metrics

This summary is extracted from saved SLMA training/test artifacts. No metric below is estimated or invented.

## Saved Artifacts

- `D:\FYP\Datatsets\ASL_Citizen\final training results\New folder (2)\slma_test_metrics_continued_v2.json`
- `D:\FYP\Datatsets\ASL_Citizen\final training results\New folder (2)\slma_training_history_continued_v2.csv`
- `D:\FYP\Datatsets\ASL_Citizen\final training results\New folder (2)\slma_confidence_threshold_report_continued_v2.csv`
- `D:\FYP\Datatsets\ASL_Citizen\final training results\New folder (2)\slma_test_predictions_continued_v2.csv`

## Final Test Metrics

| Metric | Exact saved value | Percentage |
|---|---:|---:|
| Test loss | 2.965562582015991 | - |
| TensorFlow Top-1 accuracy | 0.38877755403518677 | 38.8777554035% |
| Manual Top-1 accuracy | 0.38877755511022044 | 38.8777555110% |
| TensorFlow Top-5 accuracy | 0.6638124585151672 | 66.3812458515% |
| Manual Top-5 accuracy | 0.6638124734317119 | 66.3812473432% |
| Macro-F1 | 0.3845374045584791 | 38.4537404558% |

## Evaluation Configuration

| Field | Saved value |
|---|---:|
| Task | ASL gloss classification |
| Number of classes | 2731 |
| Sequence length | 96 frames |
| Feature dimension | 339 float features |
| Test rows | 32934 |
| Sanity mode | false |

## Confidence Threshold Report

| Threshold | Accepted | Total | Accepted accuracy | Coverage | Rejected |
|---:|---:|---:|---:|---:|---:|
| 0.3 | 22065 | 32934 | 0.5138454566054838 (51.3845%) | 0.6699763162689014 (66.9976%) | 0.3300236837310986 (33.0024%) |
| 0.4 | 16874 | 32934 | 0.5885978428351310 (58.8598%) | 0.5123580494321978 (51.2358%) | 0.48764195056780224 (48.7642%) |
| 0.5 | 12615 | 32934 | 0.6619896948077685 (66.1990%) | 0.38303880488249226 (38.3039%) | 0.6169611951175078 (61.6961%) |
| 0.6 | 9261 | 32934 | 0.7317784256559767 (73.1778%) | 0.2811987611586810 (28.1199%) | 0.7188012388413190 (71.8801%) |
| 0.7 | 6679 | 32934 | 0.8008683934720766 (80.0868%) | 0.20279953847088117 (20.2800%) | 0.7972004615291188 (79.7200%) |

The saved threshold CSV does not mark one row as `best` or `recommended`. The deployed backend configuration uses `CONFIDENCE_THRESHOLD=0.3`; therefore 0.3 is the implemented operating threshold, not an independently claimed optimum.

## Training-History Highlights

The continued-v2 history contains five epochs, numbered 0 through 4. The following values are reproducibly selected from the saved CSV:

- Highest validation Top-1 accuracy: `0.5028144121170044` at epoch `4`.
- Highest validation Top-5 accuracy: `0.7677600979804993` at epoch `3`.
- Lowest validation loss: `2.202270984649658` at epoch `4`.
- Final recorded training Top-1 accuracy: `0.6413477063179016` at epoch `4`.
- Final recorded training Top-5 accuracy: `0.8915969133377075` at epoch `4`.

## Interpretation Boundaries

- These are isolated/segmented ASL gloss-classification metrics, not continuous sentence-recognition metrics.
- High-confidence prepared demo samples are real test landmark sequences, but their individual confidence values do not replace the aggregate test metrics above.
- Real-time webcam accuracy depends on camera framing, signer variation, landmark quality, and matching the training-time 96 x 339 preprocessing. It still requires physical-camera evaluation.
