"""Browser classroom adapter. Runs the actual YOLO26 ONNX graph via JS/WASM.

This is a documented subset of the Ultralytics-style API, not the ultralytics
PyTorch package. predict is async because browser inference returns a Promise.
"""
import json
import numpy as np
from js import _classroom_predict, _classroom_show

class Keypoints:
    def __init__(self, people, width, height):
        self.data = np.array([p["keypoints"] for p in people], dtype=np.float32).reshape(-1, 17, 3)
        self.xy = self.data[:, :, :2]
        self.conf = self.data[:, :, 2]
        self.xyn = self.xy / np.array([width, height], dtype=np.float32)

    def __len__(self):
        return len(self.data)

class Boxes:
    def __init__(self, people):
        self.xyxy = np.array([p["box"] for p in people], dtype=np.float32).reshape(-1, 4)
        self.conf = np.array([p["score"] for p in people], dtype=np.float32)

class Result:
    def __init__(self, payload):
        self._payload = payload
        self.orig_shape = (payload["image"]["height"], payload["image"]["width"])
        self.keypoints = Keypoints(payload["people"], self.orig_shape[1], self.orig_shape[0])
        self.boxes = Boxes(payload["people"])

    def show(self, conf=0.50, labels=False, boxes=True):
        if not isinstance(conf, (int, float)) or not 0 <= conf <= 1:
            raise ValueError("show(conf=...) 的范围是 0 到 1。")
        _classroom_show(json.dumps({"payload": self._payload, "options": {"conf": float(conf), "labels": bool(labels), "boxes": bool(boxes)}}))

class YOLO:
    def __init__(self, model):
        if model != "yolo26n-pose.onnx":
            raise FileNotFoundError("课堂提供的模型是 yolo26n-pose.onnx，请检查模型名。")
        self.model = model

    async def predict(self, source, conf=0.25, iou=0.45, max_det=10):
        if source != "classroom-person.png":
            raise FileNotFoundError("本实验统一使用 classroom-person.png，请检查图片名。")
        if not isinstance(conf, (int, float)) or not 0 <= conf <= 1:
            raise ValueError("predict(conf=...) 的范围是 0 到 1。")
        if not isinstance(iou, (int, float)) or not 0 <= iou <= 1:
            raise ValueError("iou 的范围是 0 到 1。")
        if not isinstance(max_det, int) or not 1 <= max_det <= 20:
            raise ValueError("max_det 必须是 1 到 20 的整数。")
        payload = json.loads(await _classroom_predict(float(conf), float(iou), max_det))
        return [Result(payload)]

    async def __call__(self, source, **kwargs):
        return await self.predict(source, **kwargs)
