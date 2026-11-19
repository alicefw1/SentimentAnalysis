/* ========================================
  情感智析云平台 - Sentiment Analysis Engine
   Real inference via Python Flask backend
   Fallback: browser-side keyword mock
   ======================================== */

'use strict';

// ── Mock Model Definitions ──────────────────────────────────────
const MODELS = {
  'lstm': {
    name: 'LSTM',
    accuracy: 0.878,
    f1: 0.871,
    precision: 0.874,
    recall: 0.869,
    latency: [8, 18],
    params: '3.2M',
    recommend: 2,
    avatar: 'L',
    type: 'Recurrent Neural Network',
    desc: '单向 LSTM 基线模型，结构简单，推理速度最快'
  },
  'bilstm-attention': {
    name: 'BiLSTM + Attention',
    accuracy: 0.928,
    f1: 0.915,
    precision: 0.921,
    recall: 0.910,
    latency: [10, 22],
    params: '8.1M',
    recommend: 5,
    avatar: 'BA',
    type: 'Bidirectional LSTM + Attention',
    desc: '双向 LSTM 结合注意力机制，精准捕捉情感关键词，综合性能最优'
  },
  'bilstm-self-attention': {
    name: 'BiLSTM + Self-Attention',
    accuracy: 0.914,
    f1: 0.901,
    precision: 0.908,
    recall: 0.895,
    latency: [12, 25],
    params: '9.4M',
    recommend: 4,
    avatar: 'BS',
    type: 'Bidirectional LSTM + Self-Attention',
    desc: '双向 LSTM 配合自注意力，全局语境建模能力更强'
  },
  'bigru-self-attention': {
    name: 'BiGRU + Self-Attention',
    accuracy: 0.911,
    f1: 0.897,
    precision: 0.904,
    recall: 0.891,
    latency: [9, 20],
    params: '6.8M',
    recommend: 3,
    avatar: 'GS',
    type: 'Bidirectional GRU + Self-Attention',
    desc: 'GRU 参数更少，推理速度更快，适合资源受限场景'
  },
  'bert': {
    name: 'BERT',
    accuracy: 0.947,
    f1: 0.941,
    precision: 0.944,
    recall: 0.938,
    latency: [40, 70],
    params: '102M',
    recommend: 4,
    avatar: 'B',
    type: 'BERT (bert-base-chinese) fine-tuned',
    desc: '大规模预训练语言模型微调，准确率最高，推理开销较大'
  }
};

// ── Positive / Neutral / Negative keyword dictionaries ──────────
const POS_KEYWORDS = ['好','棒','优秀','满意','推荐','喜欢','舒适','热情','优雅','极佳','周到','感谢','惊艳','完美','精美','流畅','便宜','划算','超值','开心','高兴','快乐','感动','贴心','用心','专业','实用','靠谱','值得','喜爱','棒棒','很好','非常好','还会再来','再来','赞','强烈推荐'];
const NEG_KEYWORDS = ['差','糟糕','失望','不好','垃圾','可怕','浪费','慢','烂','恶劣','太差','不满','差评','退款','劣质','骗人','后悔','崩溃','糟糕','恶心','难吃','难看','气愤','愤怒','投诉','假货','不值','冷','冷透','破','烂','质量差'];
const NEU_KEYWORDS = ['还行','一般','普通','正常','还好','可以','凑合','马马虎虎','一般般','没什么特别','普普通通'];

// ── Backend API URL ────────────────────────────────────────────
const API_BASE = 'http://localhost:5000';

// ── 后端连接状态缓存（避免每次都等超时）──────────────────────────
let _backendOnline = null;      // null=未知 true=在线 false=离线
let _backendCheckTs = 0;

async function checkBackend() {
  const now = Date.now();
  if (_backendOnline !== null && (now - _backendCheckTs) < 10000) return _backendOnline;
  try {
    const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(2000) });
    _backendOnline = res.ok;
  } catch {
    _backendOnline = false;
  }
  _backendCheckTs = Date.now();
  return _backendOnline;
}

// ── 更新导航栏后端状态指示 ────────────────────────────────────────
function updateBackendStatusUI(online) {
  const dot  = document.querySelector('.status-dot');
  const label = document.querySelector('.nav-status');
  if (!dot || !label) return;
  if (online) {
    dot.style.background  = '#06ffa5';
    label.childNodes[1].textContent = '后端在线';
  } else {
    dot.style.background  = '#ff2d55';
    label.childNodes[1].textContent = '离线模式';
  }
}

// ── 真实 API 推理 ────────────────────────────────────────────────
async function realPredict(text, modelId) {
  const res = await fetch(`${API_BASE}/api/predict`, {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify({ text, model: modelId }),
    signal : AbortSignal.timeout(15000)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Mock 推理（离线兜底）──────────────────────────────────────────
function mockPredict(text, modelId) {
  return new Promise((resolve) => {
    const model = MODELS[modelId] || MODELS['bilstm-attention'];
    const delay = model.latency[0] + Math.random() * (model.latency[1] - model.latency[0]);
    setTimeout(() => {
      const ltext = text.toLowerCase();
      let posScore = 0, negScore = 0, neuScore = 0;
      const foundKeywords = [];
      POS_KEYWORDS.forEach(kw => { if (ltext.includes(kw)) { posScore += 1; foundKeywords.push({ word: kw, type: 'positive', weight: 0.5 + Math.random() * 0.5 }); } });
      NEG_KEYWORDS.forEach(kw => { if (ltext.includes(kw)) { negScore += 1; foundKeywords.push({ word: kw, type: 'negative', weight: 0.5 + Math.random() * 0.5 }); } });
      NEU_KEYWORDS.forEach(kw => { if (ltext.includes(kw)) { neuScore += 1; foundKeywords.push({ word: kw, type: 'neutral',  weight: 0.4 + Math.random() * 0.3 }); } });
      let rawPos = Math.max(posScore + Math.random() * 0.5, 0.05);
      let rawNeg = Math.max(negScore + Math.random() * 0.5, 0.05);
      let rawNeu = Math.max(neuScore + Math.random() * 0.3 + 0.1, 0.05);
      const noiseAmp = 1 - model.accuracy;
      rawPos = Math.max(0.01, rawPos + (Math.random() - 0.5) * noiseAmp * 2);
      rawNeg = Math.max(0.01, rawNeg + (Math.random() - 0.5) * noiseAmp * 2);
      rawNeu = Math.max(0.01, rawNeu + (Math.random() - 0.5) * noiseAmp);
      const total = rawPos + rawNeg + rawNeu;
      let pPos = rawPos / total, pNeg = rawNeg / total, pNeu = rawNeu / total;
      let sentiment, label, emoji, color;
      if (pPos >= pNeg && pPos >= pNeu) {
        sentiment = 'positive'; label = '正面情感'; emoji = '😊'; color = '#06ffa5';
        pPos = Math.max(pPos, 0.55); const r1 = 1 - pPos; pNeg = r1 * 0.4; pNeu = r1 * 0.6;
      } else if (pNeg >= pPos && pNeg >= pNeu) {
        sentiment = 'negative'; label = '负面情感'; emoji = '😞'; color = '#ff2d55';
        pNeg = Math.max(pNeg, 0.55); const r2 = 1 - pNeg; pPos = r2 * 0.3; pNeu = r2 * 0.7;
      } else {
        sentiment = 'neutral';  label = '中性情感'; emoji = '😐'; color = '#a78bfa';
        pNeu = Math.max(pNeu, 0.50); const r3 = 1 - pNeu; pPos = r3 * 0.55; pNeg = r3 * 0.45;
      }
      const s2 = pPos + pNeg + pNeu;
      pPos /= s2; pNeg /= s2; pNeu /= s2;
      const confidence = sentiment === 'positive' ? pPos : sentiment === 'negative' ? pNeg : pNeu;
      resolve({
        text, modelId,
        modelName: model.name + ' (离线模式)',
        sentiment, label, emoji, color,
        confidence: parseFloat(confidence.toFixed(4)),
        probabilities: {
          positive: parseFloat(pPos.toFixed(4)),
          neutral : parseFloat(pNeu.toFixed(4)),
          negative: parseFloat(pNeg.toFixed(4))
        },
        keywords : foundKeywords.sort((a, b) => b.weight - a.weight).slice(0, 8),
        inferenceMs: Math.round(delay),
        timestamp  : new Date().toISOString()
      });
    }, delay);
  });
}

// ── 主入口：优先走后端，降级走 Mock ──────────────────────────────
window.analyzeSentiment = async function(text, modelId) {
  if (!text || !text.trim()) return null;

  const online = await checkBackend();
  updateBackendStatusUI(online);

  if (online) {
    try {
      const result = await realPredict(text, modelId);
      _backendOnline = true;
      _backendCheckTs = Date.now();
      // 补全前端所需字段（后端已返回大部分）
      if (!result.modelName) result.modelName = (MODELS[modelId] || {}).name || modelId;
      if (!result.keywords ) result.keywords  = [];
      return result;
    } catch (err) {
      console.warn('[情感智析云平台] 后端调用失败，降级到离线模式:', err.message);
      _backendOnline = false;
      updateBackendStatusUI(false);
      return mockPredict(text, modelId);
    }
  } else {
    return mockPredict(text, modelId);
  }
};

// ── 批量预测（调用后端 /api/predict/batch）────────────────────────
window.analyzeBatch = async function(texts, modelId) {
  const online = await checkBackend();
  if (!online) {
    return Promise.all(texts.map(t => mockPredict(t, modelId)));
  }
  try {
    const res = await fetch(`${API_BASE}/api/predict/batch`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ texts, model: modelId }),
      signal : AbortSignal.timeout(30000)
    });
    const data = await res.json();
    return data.results || [];
  } catch {
    return Promise.all(texts.map(t => mockPredict(t, modelId)));
  }
};

// ── 页面加载时探测后端 ────────────────────────────────────────────
window.addEventListener('load', () => {
  checkBackend().then(online => {
    updateBackendStatusUI(online);
    if (!online) console.warn('[情感智析云平台] 后端服务未启动，当前使用离线模式。\n启动命令: python server.py');
    else         console.info('[情感智析云平台] 后端连接成功，使用真实模型推理。');
  });
});

// ── (保留) 旧 Mock 供部分页面内部直接调用 ──────────────────────────
// (不再暴露给主流程，仅作离线降级用)

// ── Expose model info（原始代码保留）────────────────────────────
// window.MODELS 在下方原始代码段中已赋值，此处不重复

// ════════════════════════════════════════════════════════════════
//  以下为原始 Mock 中 resolve() 补全的虚假字段（真实路径不再使用这段）
//  保留结构注释，此处置空由上方 realPredict/mockPredict 接管
// ════════════════════════════════════════════════════════════════
// ── Expose model info ────────────────────────────────────────────
window.MODELS = MODELS;

// ── History Management ───────────────────────────────────────────
const HISTORY_KEY = 'ns_history';

window.getHistory = function() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
};

window.addToHistory = function(record) {
  const h = window.getHistory();
  h.unshift(record);
  if (h.length > 300) h.splice(300);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch {}
};

window.clearHistory = function() {
  localStorage.removeItem(HISTORY_KEY);
  refreshHistoryPage();
};

// ── Stream simulation data ───────────────────────────────────────
const STREAM_TEXTS = [
  { text: '产品质量非常好，物流速度也超快！', sentiment: 'positive' },
  { text: '服务态度极其差劲，完全不推荐。', sentiment: 'negative' },
  { text: '今天天气一般，出门买了点东西。', sentiment: 'neutral' },
  { text: '菜品味道不错，性价比很高，会再来！', sentiment: 'positive' },
  { text: '等了好久才送达，食物都凉了，非常失望。', sentiment: 'negative' },
  { text: '酒店设施还行，位置比较方便。', sentiment: 'neutral' },
  { text: '这部电影太精彩了，剧情引人入胜！', sentiment: 'positive' },
  { text: '手机质量太差，用了三天就坏了。', sentiment: 'negative' },
  { text: '今天收到了快递，东西还可以。', sentiment: 'neutral' },
  { text: '老师讲得非常清晰，学到了很多知识！', sentiment: 'positive' },
  { text: '价格虚高，完全不值这个价钱。', sentiment: 'negative' },
  { text: '这次旅程还算顺利，没有特别的感受。', sentiment: 'neutral' },
  { text: '设计精美，做工精良，非常满意！', sentiment: 'positive' },
  { text: '客服态度恶劣，问题迟迟解决不了。', sentiment: 'negative' },
  { text: '房间面积一般，设施比较普通。', sentiment: 'neutral' },
  { text: '拍照效果令人惊艳，非常喜欢！', sentiment: 'positive' },
  { text: '包装破损严重，很不满意这次购物。', sentiment: 'negative' },
  { text: '工作进展还算正常，没什么大问题。', sentiment: 'neutral' },
];

window.getStreamText = function() {
  return STREAM_TEXTS[Math.floor(Math.random() * STREAM_TEXTS.length)];
};

// ── Dataset samples ──────────────────────────────────────────────
const SAMPLES = [
  { text: '这家酒店的服务质量真的太棒了，房间宽敞干净，设施齐全，早餐也很丰富。', label: 'positive', idx: 1 },
  { text: '位置交通非常方便，周边购物也很方便。', label: 'positive', idx: 2 },
  { text: '房间隔音效果差，前台服务态度不好，设施也比较陈旧。', label: 'negative', idx: 3 },
  { text: '价格偏高，但感觉并不值那么多，下次可能不会再来了。', label: 'negative', idx: 4 },
  { text: '酒店整体还行，位置还可以，服务态度一般，设施比较普通。', label: 'neutral', idx: 5 },
  { text: '房间大小正常，价格与同档次酒店差不多，中规中矩。', label: 'neutral', idx: 6 },
  { text: '菜的口味非常好，厨师手艺一流，下次还会来！', label: 'positive', idx: 7 },
  { text: '等待时间太长，而且菜量少，性价比低。', label: 'negative', idx: 8 },
];

window.getSamples = function() {
  return SAMPLES.slice().sort(() => Math.random() - 0.5).slice(0, 6);
};

// ── Word cloud data ──────────────────────────────────────────────
window.WORD_CLOUD_DATA = [
  { word: '好评', freq: 420, type: 'positive' }, { word: '推荐', freq: 380, type: 'positive' },
  { word: '满意', freq: 350, type: 'positive' }, { word: '差评', freq: 290, type: 'negative' },
  { word: '失望', freq: 260, type: 'negative' }, { word: '一般', freq: 240, type: 'neutral' },
  { word: '服务好', freq: 320, type: 'positive' }, { word: '质量差', freq: 280, type: 'negative' },
  { word: '快递快', freq: 210, type: 'positive' }, { word: '态度差', freq: 230, type: 'negative' },
  { word: '还行', freq: 200, type: 'neutral' }, { word: '性价比高', freq: 190, type: 'positive' },
  { word: '物流慢', freq: 180, type: 'negative' }, { word: '普通', freq: 170, type: 'neutral' },
  { word: '正常', freq: 160, type: 'neutral' }, { word: '挺好', freq: 220, type: 'positive' },
  { word: '完美', freq: 150, type: 'positive' }, { word: '很差', freq: 200, type: 'negative' },
  { word: '凑合', freq: 130, type: 'neutral' }, { word: '惊艳', freq: 140, type: 'positive' },
  { word: '差劲', freq: 190, type: 'negative' }, { word: '靠谱', freq: 125, type: 'positive' },
];
