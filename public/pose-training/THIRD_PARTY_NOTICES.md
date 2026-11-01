# 数据来源与开源说明

## 课堂图片与人工标注

原始数据：COCO 2017 validation split，COCO Consortium，https://cocodataset.org/ 。
人工关键点标注：person_keypoints_val2017.json，COCO annotation license CC BY 4.0，https://creativecommons.org/licenses/by/4.0/ 。标注文件获取镜像：https://github.com/ZHUXUHAN/Priv_Labelimg/blob/master/person_keypoints_val2017.json 。

课堂子集仅选取COCO元数据license=4（CC BY 2.0）的原始图片，https://creativecommons.org/licenses/by/2.0/ 。每张原图只保留一个人物，裁剪时保留周边空间，缩放至160×160；关键点坐标随裁剪变换。单张图片的原始COCO image ID、原始Flickr地址及许可证链接记录于assets/dataset.json的source字段，原摄影者归属请以对应Flickr作品页为准。原图片获取镜像：https://huggingface.co/datasets/merve/coco 。

本教学集合不是COCO官方发布的独立benchmark，不将72张图片称为完整COCO数据集。48/12/12划分仅服务于课堂实验，COCO原val2017作为本地教学集重新划分使用。

学生上传图片的权利归原权利人；系统不会自动更改其许可证。导出数据包中保留逐图source信息。

## TensorFlow.js

TensorFlow.js 4.22.0，TensorFlow Authors / Google，Apache License 2.0。
来源：https://github.com/tensorflow/tfjs 。本机副本：assets/tf.min.js。
许可证全文：https://www.apache.org/licenses/LICENSE-2.0 。

## fflate

fflate 0.8.2，Arjun Barrett，MIT License。
来源：https://github.com/101arrowz/fflate 。本机副本：assets/fflate.js。
MIT: Copyright (c) 2020 Arjun Barrett. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files, to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies, subject to inclusion of this notice. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
