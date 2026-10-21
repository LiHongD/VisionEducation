export const EXAMPLES=[
 {id:'first',label:'① 识别统一图片',code:`from classroom_yolo import YOLO

# 加载真正的 YOLO26 姿态模型
model = YOLO("yolo26n-pose.onnx")

# 全班使用同一张图片；conf 是人体检测置信度阈值
results = await model.predict("classroom-person.png", conf=0.25)
result = results[0]

print("检测人数：", len(result.keypoints.xy))
print("坐标数组形状：", result.keypoints.xy.shape)
print("关键点坐标（像素）：")
print(result.keypoints.xy.round(1))

# 只画出置信度不低于 0.50 的关键点
result.show(conf=0.50)
`},
 {id:'points',label:'② 读取一个关键点',code:`from classroom_yolo import YOLO

model = YOLO("yolo26n-pose.onnx")
results = await model.predict("classroom-person.png", conf=0.25)
result = results[0]

if len(result.keypoints.xy) > 0:
    # COCO 的点编号从 0 开始：9 是人物的左手腕
    wrist = result.keypoints.xy[0, 9]
    confidence = result.keypoints.conf[0, 9]
    print("左手腕 x, y：", wrist.round(1))
    print("该点置信度：", round(float(confidence), 3))
else:
    print("没有检测到人体，试试降低 conf。")

result.show(conf=0.50, labels=True)
`},
 {id:'rule',label:'③ 写一条动作规则',code:`from classroom_yolo import YOLO

model = YOLO("yolo26n-pose.onnx")
results = await model.predict("classroom-person.png", conf=0.25)
result = results[0]

if len(result.keypoints.xy) > 0:
    points = result.keypoints.xy[0]
    confidence = result.keypoints.conf[0]
    # 5 是左肩，9 是左手腕。图像 y 坐标向下增大。
    if min(confidence[5], confidence[9]) < 0.50:
        print("关键点不够可信，暂不判断。")
    elif points[9, 1] < points[5, 1]:
        print("左手腕高于左肩。还需结合肘角判断是否直臂。")
    else:
        print("左手腕没有高于左肩。")
else:
    print("没有检测到人体，无法判断动作。")

result.show(conf=0.50, labels=True)
`}
];
export const LOCAL_EXAMPLE=`# 本地 Python 示例：先安装 pip install ultralytics
from ultralytics import YOLO

model = YOLO("yolo26n-pose.pt")
results = model.predict("classroom-person.png", conf=0.25)
result = results[0]
print(result.keypoints.xy)
print(result.keypoints.conf)
result.show()
`;
