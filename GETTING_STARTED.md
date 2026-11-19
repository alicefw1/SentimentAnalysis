# 情感智析云平台 启动速查（命令 + 作用）

## 后端（Flask）
```bash
python -m venv .venv           # 创建虚拟环境
.venv\Scripts\activate        # 进入虚拟环境（Windows）
pip install -r requirements.txt # 安装依赖
python server.py               # 启动后端，端口 5000
```
健康检查：打开 http://localhost:5000/api/health

## 前端（静态页）在新终端
```bash
cd frontend
python -m http.server 8000     # 启动静态服务器，端口 8000
```
浏览器访问：http://localhost:8000

## 验证联通
```bash
curl http://localhost:5000/api/health             # 看后端在线
curl -X POST http://localhost:5000/api/predict \ 
  -H "Content-Type: application/json" \         
  -d "{\"text\":\"这款产品质量很好\",\"model\":\"bilstm-attention\"}" # 单条推理
```

## 批量与模型列表
```bash
curl -X POST http://localhost:5000/api/predict/batch \ 
  -H "Content-Type: application/json" \ 
  -d "{\"texts\":[\"句子1\",\"句子2\"],\"model\":\"bilstm-attention\"}" # 批量推理
curl http://localhost:5000/api/models               # 查看可用模型
```

## 模型文件（可选，提升精度）
- Keras：model/Word2vec_model.pkl + 对应 *.json / *.h5
- ONNX BERT：onnx/model.onnx + onnx/vocab.txt
缺少时自动回退 SnowNLP（精度较低）。
