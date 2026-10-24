# Third-party components

## Combat Sports classroom subset and MobileNetV2

- Dataset: Evan Quinn, *Combat Sports Dataset*, 2025-05-06, DOI 10.5281/zenodo.15349809, https://zenodo.org/records/15349809. Original archive `CombatSports Dataset - Greyscale 10%.zip`, md5 `34ea747443ed4dbd572e188f8b34178d`.
- Author declares **Public Domain** in Zenodo and archive `data.yaml` / `README.dataset.txt`. The project retains attribution, selects `cross`, `high-guard`, `kick`, crops annotated action regions and resizes/pads to 224×224. Includes combat-sport scenes; not standardized Chinese-wushu postures.
- 180 train / 45 validation images with real precomputed features are student-facing; 60 fixed test features are server-only. Source groups, bounding boxes and processed SHA-256 are recorded in `docs/classifier-dataset-provenance.json`.
- Backbone: ONNX Model Zoo MobileNetV2 `mobilenetv2-12.onnx`, https://github.com/onnx/models/tree/main/validated/vision/classification/mobilenet — Apache-2.0, full license in `public/model-lab-assets/ONNX-Model-Zoo-LICENSE`.
- Modification: remove final ImageNet classifier, expose global pooled tensor `472` (1280 features), apply fixed signed projection to 256 dimensions and L2 normalization. Derived ONNX SHA-256: `39db0fa09cfc7df03f49e3d52c35e4a83b9a1064b3a7091356c2d1f66d99f525`.
- Inference reuses ONNX Runtime Web 1.22.0; training and server evaluation are project code. Uploaded JSON models do not execute third-party code.

## YOLO26n-pose

- Official model: https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26n-pose.onnx
- Publisher/source: https://github.com/ultralytics/ultralytics/tree/v8.4.38
- Model metadata: Ultralytics 8.4.38, pose task, COCO 17 keypoints, ONNX opset 20, end-to-end output.
- Input: float32 `[1, 3, 640, 640]`; output `[1, 300, 57]` (box, confidence, class, 17 × x/y/confidence).
- License: GNU Affero General Public License v3.0; full text in `LICENSE`.
- Documentation: https://docs.ultralytics.com/models/yolo26/ and https://docs.ultralytics.com/tasks/pose/
- Original model weights are distributed unchanged. The teaching interface and output parser are project source.

## Browser Python and editor

- Pyodide 0.27.7 / CPython 3.12.7: https://github.com/pyodide/pyodide/tree/0.27.7 — MPL-2.0; `public/vendor/pyodide/LICENSE`.
- CPython: https://github.com/python/cpython/tree/v3.12.7 — Python Software Foundation license; `public/vendor/pyodide/LICENSE-CPython`.
- NumPy 2.0.2 Pyodide wheel: pinned by `public/vendor/pyodide/pyodide-lock.json`; NumPy's license is included inside the wheel and copied to `public/vendor/pyodide/LICENSE-NumPy`.
- ONNX Runtime Web 1.22.0: https://github.com/microsoft/onnxruntime/tree/v1.22.0 — MIT; `public/vendor/ort/LICENSE` and `ThirdPartyNotices.txt`.
- CodeMirror 5.65.20: https://github.com/codemirror/codemirror5/tree/5.65.20 — MIT; `public/vendor/codemirror/LICENSE`.
- Runtime assets are downloaded from the versioned official release/npm distributions by `scripts/prepare-pose-lab-assets.ps1`, then served locally. File hashes are in `public/pose-lab-assets/manifest.json`.

## Existing website components and media

- Three.js: MIT; `public/vendor/THREE-LICENSE.txt`.
- shadcn stylesheet: see `vendor/shadcn-tailwind-4.13.0.LICENSE.md`.
- Sites build plugin: see `build/sites-vite-plugin.LICENSE`.
- Other npm dependencies: licenses in the respective installed packages, versions pinned in `package-lock.json`.
- The reference character model (`textured_mesh.glb` and derived assets) was supplied by the project owner. The unified classroom image is copied from the site's existing `public/micro15-assets/neutral.png`. No student submissions, private class databases or credentials are included in this source repository.
