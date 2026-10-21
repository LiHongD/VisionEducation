# Third-party components

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
