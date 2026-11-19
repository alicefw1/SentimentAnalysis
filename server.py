# -*- coding: utf-8 -*-
"""
情感智析云平台 - 情感分析后端服务
支持多模型：SnowNLP（基础）/ Keras BiLSTM+Attention / ONNX BERT
启动命令: python server.py
"""

import os
import sys
import time
import json
import logging
import traceback
import importlib
from pathlib import Path

from flask import Flask, request, jsonify
from flask_cors import CORS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # 允许所有来源的跨域请求

# ─── 根目录 ─────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent

# ─── 关键词情感词典 ──────────────────────────────────────────────────
POS_WORDS = set([
    '好','棒','优秀','满意','推荐','喜欢','舒适','热情','优雅','极佳','周到',
    '感谢','惊艳','完美','精美','流畅','便宜','划算','超值','开心','高兴',
    '快乐','感动','贴心','用心','专业','实用','靠谱','值得','喜爱','赞',
    '强烈推荐','非常好','很好','好评','不错','精彩','出色','震撼','清晰',
    '丰富','干净','方便','齐全','美味','温馨','舒心','愉快','满分','超棒'
])
NEG_WORDS = set([
    '差','糟糕','失望','不好','垃圾','可怕','浪费','慢','烂','恶劣','太差',
    '不满','差评','退款','劣质','骗人','后悔','崩溃','恶心','难吃','难看',
    '气愤','愤怒','投诉','假货','不值','破损','冷透','质量差','态度差',
    '很差','太差了','非常差','极差','坑爹','宰客','欺骗','拒绝','闹心'
])
NEU_WORDS = set([
    '还行','一般','普通','正常','还好','可以','凑合','马马虎虎','一般般',
    '普普通通','中规中矩','还算','还可以','说得过去','没什么特别'
])


# ══════════════════════════════════════════════════════════
#  模型后端基类
# ══════════════════════════════════════════════════════════
class BasePredictor:
    name = "base"
    def predict(self, text: str) -> dict:
        raise NotImplementedError


# ══════════════════════════════════════════════════════════
#  后端1: SnowNLP（无需预训练文件，开箱即用）
# ══════════════════════════════════════════════════════════
class SnowNLPPredictor(BasePredictor):
    name = "snownlp"

    def __init__(self):
        import snownlp
        self.snownlp = snownlp
        log.info("✅ SnowNLP 模型加载成功")

    def predict(self, text: str) -> dict:
        s = self.snownlp.SnowNLP(text)
        score = float(s.sentiments)  # 0~1，越大越正面

        # 三分类概率建模
        if score > 0.65:
            pos   = score
            neu   = (1 - score) * 0.6
            neg   = (1 - score) * 0.4
            label = 'positive'
        elif score < 0.35:
            neg   = 1 - score
            neu   = score * 0.6
            pos   = score * 0.4
            label = 'negative'
        else:
            neu   = 0.5 + abs(score - 0.5) * 0.2
            pos   = (1 - neu) * (score / 1.0)
            neg   = (1 - neu) * ((1 - score) / 1.0)
            label = 'neutral'

        total = pos + neu + neg
        return {
            'probabilities': {
                'positive': round(pos / total, 4),
                'neutral' : round(neu / total, 4),
                'negative': round(neg / total, 4),
            },
            'sentiment': label,
            'raw_score': round(score, 4)
        }


# ══════════════════════════════════════════════════════════
#  后端2: Keras BiLSTM+Attention（需要 Word2Vec 模型文件）
# ══════════════════════════════════════════════════════════
class KerasBiLSTMPredictor(BasePredictor):
    name = "keras"

    def __init__(self, model_name='bilstm-attention'):
        import jieba
        import numpy as np
        from tensorflow.keras.preprocessing import sequence
        from gensim.models.word2vec import Word2Vec
        from gensim.corpora.dictionary import Dictionary
        from tensorflow.keras.models import model_from_json

        sys.path.insert(0, str(BASE_DIR))
        from utils import AttentionLayer, SelfAttentionLayer

        w2v_path = BASE_DIR / 'model' / 'Word2vec_model.pkl'
        json_path = BASE_DIR / 'model' / f'{model_name}.json'
        h5_path   = BASE_DIR / 'model' / f'{model_name}.h5'

        log.info(f"  -> 加载 Word2Vec: {w2v_path}")
        self._w2v_model = Word2Vec.load(str(w2v_path))
        vocab = list(self._w2v_model.wv.key_to_index.keys())
        gd = Dictionary()
        gd.doc2bow(vocab, allow_update=True)
        self._w2indx = {v: k + 1 for k, v in gd.items()}

        log.info(f"  -> 加载 Keras 模型: {json_path}")
        custom_objects = {'AttentionLayer': AttentionLayer, 'SelfAttentionLayer': SelfAttentionLayer}
        with open(json_path, 'r') as f:
            json_string = json.load(f)
        self._model = model_from_json(json_string, custom_objects=custom_objects)
        self._model.load_weights(str(h5_path))
        self._model.compile(loss='categorical_crossentropy', optimizer='adam', metrics=['accuracy'])

        self._jieba      = jieba
        self._np         = np
        self._sequence   = sequence
        self._maxlen     = 100
        log.info(f"✅ Keras {model_name} 加载成功")

    def _text_to_seq(self, text: str):
        words = self._jieba.lcut(text)
        idxs  = [self._w2indx.get(w, 0) for w in words]
        return self._sequence.pad_sequences([idxs], maxlen=self._maxlen)

    def predict(self, text: str) -> dict:
        data   = self._text_to_seq(text)
        result = self._model.predict(data)[0]  # shape: (3,) or (2,)

        if len(result) == 3:
            # 三分类: [neg, neu, pos] 或 [pos, neu, neg] 依照训练顺序
            pos, neu, neg = float(result[0]), float(result[1]), float(result[2])
        else:
            # 二分类: [neg, pos]
            neg, pos = float(result[0]), float(result[1])
            neu = 0.1

        total = pos + neu + neg + 1e-9
        pos /= total; neu /= total; neg /= total

        if pos >= neg and pos >= neu:
            label = 'positive'
        elif neg >= pos and neg >= neu:
            label = 'negative'
        else:
            label = 'neutral'

        return {
            'probabilities': {
                'positive': round(pos, 4),
                'neutral' : round(neu, 4),
                'negative': round(neg, 4),
            },
            'sentiment': label,
            'raw_score': round(pos, 4)
        }


# ══════════════════════════════════════════════════════════
#  后端3: ONNX BERT（需要 onnx/model.onnx + vocab.txt）
# ══════════════════════════════════════════════════════════
class ONNXBertPredictor(BasePredictor):
    name = "onnx-bert"

    def __init__(self):
        import numpy as np
        from transformers import BertTokenizer
        from onnxruntime import InferenceSession

        onnx_dir   = BASE_DIR / 'onnx'
        onnx_model = onnx_dir / 'model.onnx'

        log.info(f"  -> 加载 ONNX 模型: {onnx_model}")
        self._tokenizer = BertTokenizer.from_pretrained(str(onnx_dir))
        self._session   = InferenceSession(str(onnx_model))
        self._np        = np
        log.info("✅ ONNX BERT 加载成功")

    def predict(self, text: str) -> dict:
        np = self._np
        inputs = self._tokenizer(text, return_tensors="np", truncation=True, max_length=128)
        for k in inputs:
            inputs[k] = inputs[k].astype(np.int64)
        outputs = self._session.run(output_names=None, input_feed=dict(inputs))[0][0]
        probs   = np.exp(outputs) / np.sum(np.exp(outputs))

        # 标签顺序: 0=negative, 1=neutral, 2=positive
        neg, neu, pos = float(probs[0]), float(probs[1]), float(probs[2])
        idx = probs.argmax()
        label = ['negative', 'neutral', 'positive'][idx]

        return {
            'probabilities': {
                'positive': round(pos, 4),
                'neutral' : round(neu, 4),
                'negative': round(neg, 4),
            },
            'sentiment': label,
            'raw_score': round(pos, 4)
        }


# ══════════════════════════════════════════════════════════
#  关键词提取
# ══════════════════════════════════════════════════════════
def extract_keywords(text: str, sentiment: str) -> list:
    try:
        import jieba.analyse
        tags = jieba.analyse.extract_tags(text, topK=10, withWeight=True)
        result = []
        for word, weight in tags:
            if word in POS_WORDS:
                ktype = 'positive'
            elif word in NEG_WORDS:
                ktype = 'negative'
            elif word in NEU_WORDS:
                ktype = 'neutral'
            else:
                ktype = sentiment  # 归到当前情感
            result.append({'word': word, 'type': ktype, 'weight': round(float(weight), 4)})
        return result[:8]
    except Exception:
        return []


# ══════════════════════════════════════════════════════════
#  模型加载管理器
# ══════════════════════════════════════════════════════════
LOADED_BACKENDS: dict[str, BasePredictor] = {}   # modelId -> predictor
DEFAULT_PREDICTOR: BasePredictor | None = None

MODEL_META = {
    'lstm'                : {'name': 'LSTM',                    'type': 'LSTM'},
    'bilstm-attention'    : {'name': 'BiLSTM + Attention',      'type': 'Keras'},
    'bilstm-self-attention': {'name': 'BiLSTM + Self-Attention','type': 'Keras'},
    'bigru-self-attention': {'name': 'BiGRU + Self-Attention',  'type': 'Keras'},
    'bert'                : {'name': 'BERT',                    'type': 'ONNX'},
}

def load_all_backends():
    global DEFAULT_PREDICTOR

    # ── 1. 优先尝试 ONNX BERT ──────────────────────────────
    onnx_dir = BASE_DIR / 'onnx' / 'model.onnx'
    if onnx_dir.exists():
        try:
            pred = ONNXBertPredictor()
            LOADED_BACKENDS['bert'] = pred
            if DEFAULT_PREDICTOR is None:
                DEFAULT_PREDICTOR = pred
        except Exception as e:
            log.warning(f"⚠️  ONNX BERT 加载失败: {e}")

    # ── 2. 尝试 Keras 模型 ──────────────────────────────────
    w2v_path = BASE_DIR / 'model' / 'Word2vec_model.pkl'
    if w2v_path.exists():
        for model_id in ['bilstm-attention', 'bilstm-self-attention', 'bigru-self-attention', 'lstm']:
            h5 = BASE_DIR / 'model' / f'{model_id}.h5'
            js = BASE_DIR / 'model' / f'{model_id}.json'
            if h5.exists() and js.exists():
                try:
                    pred = KerasBiLSTMPredictor(model_id)
                    LOADED_BACKENDS[model_id] = pred
                    if DEFAULT_PREDICTOR is None:
                        DEFAULT_PREDICTOR = pred
                except Exception as e:
                    log.warning(f"⚠️  Keras {model_id} 加载失败: {e}")
    else:
        log.warning("⚠️  未找到 Word2vec_model.pkl，跳过 Keras 模型加载")

    # ── 3. SnowNLP 兜底（始终加载）──────────────────────────
    try:
        snow = SnowNLPPredictor()
        # 绑定到所有未被覆盖的 modelId，以及 snownlp 本身
        LOADED_BACKENDS['snownlp'] = snow
        for model_id in MODEL_META:
            if model_id not in LOADED_BACKENDS:
                LOADED_BACKENDS[model_id] = snow
        if DEFAULT_PREDICTOR is None:
            DEFAULT_PREDICTOR = snow
    except Exception as e:
        log.error(f"❌  SnowNLP 加载失败: {e}")

    log.info(f"🚀 后端就绪，已加载: {list(LOADED_BACKENDS.keys())}")
    log.info(f"🎯 默认模型: {DEFAULT_PREDICTOR.name if DEFAULT_PREDICTOR else '无'}")


# ══════════════════════════════════════════════════════════
#  路由
# ══════════════════════════════════════════════════════════

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status'  : 'ok',
        'backends': {k: v.name for k, v in LOADED_BACKENDS.items()},
        'default' : DEFAULT_PREDICTOR.name if DEFAULT_PREDICTOR else None
    })


@app.route('/api/models', methods=['GET'])
def models():
    result = {}
    for mid, meta in MODEL_META.items():
        result[mid] = {
            **meta,
            'available': mid in LOADED_BACKENDS,
            'backend'  : LOADED_BACKENDS[mid].name if mid in LOADED_BACKENDS else None
        }
    return jsonify(result)


@app.route('/api/predict', methods=['POST'])
def predict():
    data     = request.get_json(force=True, silent=True) or {}
    text     = (data.get('text') or '').strip()
    model_id = (data.get('model') or 'bilstm-attention').strip()

    if not text:
        return jsonify({'error': '文本不能为空'}), 400
    if len(text) > 5000:
        return jsonify({'error': '文本过长，请控制在 5000 字符以内'}), 400

    predictor = LOADED_BACKENDS.get(model_id) or DEFAULT_PREDICTOR
    if predictor is None:
        return jsonify({'error': '后端模型未就绪，请稍后重试'}), 503

    t0 = time.time()
    try:
        pred = predictor.predict(text)
    except Exception as e:
        log.error(traceback.format_exc())
        return jsonify({'error': f'推理失败: {str(e)}'}), 500
    elapsed_ms = int((time.time() - t0) * 1000)

    sentiment = pred['sentiment']
    probs     = pred['probabilities']
    keywords  = extract_keywords(text, sentiment)

    SENT_META = {
        'positive': {'label': '正面情感', 'emoji': '😊', 'color': '#06ffa5'},
        'negative': {'label': '负面情感', 'emoji': '😞', 'color': '#ff2d55'},
        'neutral' : {'label': '中性情感', 'emoji': '😐', 'color': '#a78bfa'},
    }
    sm = SENT_META[sentiment]
    conf = probs.get(sentiment, 0.0)

    meta = MODEL_META.get(model_id, {'name': model_id, 'type': 'unknown'})

    result = {
        'text'         : text,
        'modelId'      : model_id,
        'modelName'    : meta['name'],
        'sentiment'    : sentiment,
        'label'        : sm['label'],
        'emoji'        : sm['emoji'],
        'color'        : sm['color'],
        'confidence'   : round(conf, 4),
        'probabilities': probs,
        'keywords'     : keywords,
        'inferenceMs'  : elapsed_ms,
        'backendUsed'  : predictor.name,
        'timestamp'    : time.strftime('%Y-%m-%dT%H:%M:%S') + 'Z'
    }
    log.info(f"[predict] model={model_id} backend={predictor.name} "
             f"sentiment={sentiment} conf={conf:.3f} cost={elapsed_ms}ms text='{text[:30]}...'")
    return jsonify(result)


# ══════════════════════════════════════════════════════════
#  批量预测
# ══════════════════════════════════════════════════════════
@app.route('/api/predict/batch', methods=['POST'])
def predict_batch():
    data     = request.get_json(force=True, silent=True) or {}
    texts    = data.get('texts') or []
    model_id = (data.get('model') or 'bilstm-attention').strip()

    if not texts or not isinstance(texts, list):
        return jsonify({'error': '请提供 texts 数组'}), 400
    if len(texts) > 50:
        return jsonify({'error': '批量最多支持 50 条'}), 400

    predictor = LOADED_BACKENDS.get(model_id) or DEFAULT_PREDICTOR
    results   = []
    for txt in texts:
        txt = str(txt).strip()
        if not txt:
            continue
        try:
            pred = predictor.predict(txt)
        except Exception as e:
            pred = {'sentiment': 'neutral', 'probabilities': {'positive': 0.33,'neutral': 0.34,'negative': 0.33}}
        SENT_META = {
            'positive': {'label': '正面情感', 'emoji': '😊', 'color': '#06ffa5'},
            'negative': {'label': '负面情感', 'emoji': '😞', 'color': '#ff2d55'},
            'neutral' : {'label': '中性情感', 'emoji': '😐', 'color': '#a78bfa'},
        }
        sm   = SENT_META[pred['sentiment']]
        conf = pred['probabilities'].get(pred['sentiment'], 0.0)
        results.append({
            'text'         : txt,
            'sentiment'    : pred['sentiment'],
            'label'        : sm['label'],
            'emoji'        : sm['emoji'],
            'color'        : sm['color'],
            'confidence'   : round(conf, 4),
            'probabilities': pred['probabilities'],
        })

    return jsonify({'results': results, 'modelId': model_id, 'count': len(results)})


# ══════════════════════════════════════════════════════════
#  主入口
# ══════════════════════════════════════════════════════════
if __name__ == '__main__':
    log.info("=" * 55)
    log.info("  情感智析云平台 - 情感分析后端服务")
    log.info("=" * 55)
    load_all_backends()
    log.info("服务地址: http://localhost:5000")
    log.info("健康检查: http://localhost:5000/api/health")
    log.info("=" * 55)
    app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)
