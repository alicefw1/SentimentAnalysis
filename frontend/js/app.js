/* ========================================
  情感智析云平台 - Core Application
   Router · Page Logic · Interactions
   ======================================== */

'use strict';

// ── State ────────────────────────────────────────────────────────
const State = {
  currentPage: 'home',
  selectedModel: 'bilstm-attention',
  sessionCount: 0,
  sessionConfTotal: 0,
  lastResult: null,
  streamRunning: false,
  streamInterval: null,
  streamCounts: { positive: 0, neutral: 0, negative: 0 },
  streamHistory: Array(20).fill(0).map(() => ({ pos: 0, neu: 0, neg: 0 })),
  batchRunning: false,
  batchInterval: null,
  batchItems: [],
  batchResults: [],
  trainingRunning: false,
  trainingInterval: null,
  trainingEpoch: 0,
  historyFilter: 'all',
  compareSelectedModels: [],
  compareRunning: false,
};

// ── Navigation ───────────────────────────────────────────────────
window.navigate = function(page) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  const navEl  = document.querySelector(`[data-page="${page}"]`);
  if (pageEl) pageEl.classList.add('active');
  if (navEl)  navEl.classList.add('active');

  State.currentPage = page;

  // Page-specific initializers
  switch (page) {
    case 'results':   onResultsPage();   break;
    case 'compare':   onComparePage();   break;
    case 'metrics':   onMetricsPage();   break;
    case 'history':   refreshHistoryPage(); break;
    case 'viz':       onVizPage();       break;
    case 'dataset':   onDatasetPage();   break;
    case 'stream':    onStreamPage();    break;
    case 'training':  onTrainingPage();  break;
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ── Toast Notifications ──────────────────────────────────────────
window.showToast = function(type, title, sub) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warn: '⚠️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<div class="toast-icon">${icons[type] || 'ℹ️'}</div>
    <div><div class="toast-msg font-bold">${title}</div>${sub ? `<div class="toast-sub">${sub}</div>` : ''}</div>`;
  const container = document.getElementById('toast-container');
  container.appendChild(el);
  setTimeout(() => { try { container.removeChild(el); } catch {} }, 3100);
};

// ── Analysis Lab ─────────────────────────────────────────────────
window.updateCharCount = function(el) {
  const counter = document.getElementById('char-counter');
  const len = el.value.length;
  counter.textContent = `${len} / 2000 字符`;
  counter.className = 'char-counter' + (len > 1800 ? ' warn' : '') + (len === 2000 ? ' error' : '');
};

window.clearInput = function() {
  document.getElementById('main-input').value = '';
  updateCharCount(document.getElementById('main-input'));
};

window.pasteClipboard = async function() {
  try {
    const text = await navigator.clipboard.readText();
    document.getElementById('main-input').value = text.slice(0, 2000);
    updateCharCount(document.getElementById('main-input'));
    showToast('success', '已粘贴', `共 ${text.slice(0, 2000).length} 字符`);
  } catch {
    showToast('info', '请手动粘贴', '浏览器限制了剪贴板访问');
  }
};

window.loadExample = function() {
  const examples = [
    '这款产品的设计非常精美，使用体验极佳，完全超出了我的期望，强烈推荐！',
    '今天去超市买了些日常用品，价格与平时差不多，没什么特别的感受。',
    '这次快递服务太差了，包裹破损严重，客服态度也很恶劣，非常失望！',
    '电影剧情引人入胜，演员表演出色，特效也相当震撼，值得一看。',
    '酒店位置还行，交通方便，房间大小一般，设施比较普通，性价比凑合。'
  ];
  document.getElementById('main-input').value = examples[Math.floor(Math.random() * examples.length)];
  updateCharCount(document.getElementById('main-input'));
};

window.setExample = function(el) {
  const text = el.textContent.replace(/^.+\n/, '').trim();
  document.getElementById('main-input').value = text;
  updateCharCount(document.getElementById('main-input'));
  navigate('analysis');
};

window.selectModel = function(el) {
  document.querySelectorAll('.model-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  State.selectedModel = el.dataset.model;
};

window.startAnalysis = async function() {
  const text = document.getElementById('main-input').value.trim();
  if (!text) { showToast('warn', '请先输入文本', '分析文本不能为空'); return; }

  const btn = document.getElementById('analyze-btn');
  const loadCard = document.getElementById('analysis-loading-card');
  btn.disabled = true;
  btn.textContent = '⏳ 分析中...';
  loadCard.classList.remove('hidden');

  // Simulate step-by-step loading
  const steps = ['si-1', 'si-2', 'si-3', 'si-4'];
  let stepIdx = 0;
  const stepInterval = setInterval(() => {
    if (stepIdx > 0) {
      document.getElementById(steps[stepIdx - 1]).classList.remove('active');
      document.getElementById(steps[stepIdx - 1]).classList.add('done');
      document.getElementById(steps[stepIdx - 1]).textContent = '✓';
    }
    if (stepIdx < steps.length) {
      document.getElementById(steps[stepIdx]).classList.add('active');
      stepIdx++;
    } else clearInterval(stepInterval);
  }, 300);

  try {
    const result = await window.analyzeSentiment(text, State.selectedModel);
    clearInterval(stepInterval);
    steps.forEach(s => { document.getElementById(s).classList.remove('active'); document.getElementById(s).classList.add('done'); document.getElementById(s).textContent = '✓'; });

    State.lastResult = result;
    State.sessionCount++;
    State.sessionConfTotal += result.confidence;

    document.getElementById('session-count').textContent = State.sessionCount;
    document.getElementById('session-avg').textContent = (State.sessionConfTotal / State.sessionCount * 100).toFixed(1) + '%';

    window.addToHistory(result);
    applyResultToPage(result);

    setTimeout(() => {
      loadCard.classList.add('hidden');
      btn.disabled = false; btn.textContent = '🔍 开始分析';
      // Reset steps
      steps.forEach((s, i) => { const el = document.getElementById(s); el.classList.remove('done','active'); el.textContent = i + 1; });
      navigate('results');
      showToast('success', '分析完成', `${result.label} · 置信度 ${(result.confidence * 100).toFixed(1)}%`);
    }, 400);

  } catch (e) {
    clearInterval(stepInterval);
    loadCard.classList.add('hidden');
    btn.disabled = false; btn.textContent = '🔍 开始分析';
    showToast('error', '分析失败', '请稍后重试');
  }
};

function applyResultToPage(r) {
  document.getElementById('result-model-info').textContent = `模型：${r.modelName} · 耗时 ${r.inferenceMs}ms`;
  document.getElementById('result-emoji').textContent = r.emoji;
  document.getElementById('result-label').textContent = r.label;
  document.getElementById('result-label').style.color   = r.color;
  document.getElementById('result-conf').textContent    = `置信度 ${(r.confidence * 100).toFixed(1)}%`;
  document.getElementById('result-score').textContent   = (r.confidence * 100).toFixed(1);

  const pos = r.probabilities.positive, neu = r.probabilities.neutral, neg = r.probabilities.negative;
  document.getElementById('rs-pos').textContent = (pos * 100).toFixed(1) + '%';
  document.getElementById('rs-neu').textContent = (neu * 100).toFixed(1) + '%';
  document.getElementById('rs-neg').textContent = (neg * 100).toFixed(1) + '%';
  document.getElementById('rs-time').textContent = r.inferenceMs + 'ms';

  document.getElementById('bar-pos').textContent = (pos * 100).toFixed(1) + '%';
  document.getElementById('bar-neu').textContent = (neu * 100).toFixed(1) + '%';
  document.getElementById('bar-neg').textContent = (neg * 100).toFixed(1) + '%';
  document.getElementById('fill-pos').style.width = (pos * 100) + '%';
  document.getElementById('fill-neu').style.width = (neu * 100) + '%';
  document.getElementById('fill-neg').style.width = (neg * 100) + '%';

  // Keyword cloud
  const cloud = document.getElementById('keyword-cloud');
  if (r.keywords && r.keywords.length) {
    const colMap = { positive: '#06ffa5', negative: '#ff2d55', neutral: '#a78bfa' };
    const bcMap  = { positive: 'rgba(6,255,165,0.1)', negative: 'rgba(255,45,85,0.1)', neutral: 'rgba(124,58,237,0.1)' };
    cloud.innerHTML = r.keywords.map(k =>
      `<span class="keyword-pill" style="background:${bcMap[k.type]};color:${colMap[k.type]};border-color:${colMap[k.type]}44">${k.word} ${k.type==='positive' ? '+' : k.type==='negative' ? '-' : ''}${k.weight.toFixed(2)}</span>`
    ).join('');
  } else {
    cloud.innerHTML = '<span class="text-muted text-sm">未检测到明显情感关键词</span>';
  }

  // Analyzed text with highlights
  const textEl = document.getElementById('analyzed-text');
  let highlighted = r.text;
  if (r.keywords && document.getElementById('sw-highlight').checked) {
    const colMap = { positive: '#06ffa5', negative: '#ff2d55', neutral: '#a78bfa' };
    const bgMap  = { positive: 'rgba(6,255,165,0.15)', negative: 'rgba(255,45,85,0.15)', neutral: 'rgba(124,58,237,0.15)' };
    r.keywords.forEach(k => {
      const regex = new RegExp(k.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      highlighted = highlighted.replace(regex,
        `<span style="background:${bgMap[k.type]};color:${colMap[k.type]};border-radius:3px;padding:1px 4px">${k.word}</span>`);
    });
  }
  textEl.innerHTML = highlighted;

  window.drawResultChart(pos, neu, neg);
}

// ── Results Page ──────────────────────────────────────────────────
function onResultsPage() {
  if (State.lastResult) {
    applyResultToPage(State.lastResult);
  }
}

// ── History Page ──────────────────────────────────────────────────
window.refreshHistoryPage = function() {
  const history = window.getHistory();
  const hTotal = document.getElementById('h-total');
  const hPos   = document.getElementById('h-pos');
  const hNeu   = document.getElementById('h-neu');
  const hNeg   = document.getElementById('h-neg');
  if (hTotal) hTotal.textContent = history.length;
  if (hPos)   hPos.textContent   = history.filter(h => h.sentiment === 'positive').length;
  if (hNeu)   hNeu.textContent   = history.filter(h => h.sentiment === 'neutral').length;
  if (hNeg)   hNeg.textContent   = history.filter(h => h.sentiment === 'negative').length;
  renderHistoryList(history);
};

function renderHistoryList(history) {
  const list = document.getElementById('history-list');
  if (!list) return;
  const search  = (document.getElementById('history-search')  || {}).value || '';
  const filter  = State.historyFilter;
  let items = history.filter(h => {
    const matchFilter = filter === 'all' || h.sentiment === filter;
    const matchSearch = !search || h.text.includes(search);
    return matchFilter && matchSearch;
  });

  if (!items.length) {
    list.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-muted)"><div style="font-size:40px;margin-bottom:12px">🕐</div>${history.length ? '没有符合条件的记录' : '暂无历史记录'}</div>`;
    return;
  }

  const colMap   = { positive: '#06ffa5', negative: '#ff2d55', neutral: '#a78bfa' };
  const emojiMap = { positive: '😊', negative: '😞', neutral: '😐' };
  const labelMap = { positive: '正面', negative: '负面', neutral: '中性' };
  list.innerHTML = items.slice(0, 100).map((h, i) => `
    <div class="history-item" onclick="viewHistoryItem(${i})">
      <div class="history-num">${i + 1}</div>
      <div class="history-text" title="${h.text}">${h.text.slice(0, 80)}${h.text.length > 80 ? '...' : ''}</div>
      <div class="history-meta">
        <span class="sentiment-badge sentiment-${h.sentiment}">${emojiMap[h.sentiment]} ${labelMap[h.sentiment]}</span>
        <span style="font-size:12px;font-family:var(--font-mono);color:${colMap[h.sentiment]}">${(h.confidence * 100).toFixed(1)}%</span>
        <span class="history-time">${formatTime(h.timestamp)}</span>
      </div>
    </div>`).join('');
}

window.viewHistoryItem = function(i) {
  const history = window.getHistory();
  const h = history[i];
  if (!h) return;
  State.lastResult = h;
  applyResultToPage(h);
  navigate('results');
};

window.filterHistory = function() { renderHistoryList(window.getHistory()); };

window.setFilter = function(el) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  State.historyFilter = el.dataset.filter;
  renderHistoryList(window.getHistory());
};

window.exportHistory = function() {
  const h = window.getHistory();
  const csv = ['文本,情感,置信度,模型,时间', ...h.map(r =>
    `"${r.text.replace(/"/g, '""')}",${r.label},${(r.confidence*100).toFixed(1)}%,${r.modelName},${r.timestamp}`)].join('\n');
  downloadFile('history.csv', csv, 'text/csv');
  showToast('success', '导出成功', `共 ${h.length} 条记录`);
};

// ── Compare Page ──────────────────────────────────────────────────
function getCompareModels() {
  const models = window.MODELS || {
    'lstm': {
      name: 'LSTM', accuracy: 0.878, f1: 0.871, precision: 0.874, recall: 0.869,
      latency: [8, 18], params: '3.2M', recommend: 2, avatar: 'L', type: 'Recurrent Neural Network',
      desc: '单向 LSTM 基线模型，结构简单，推理速度最快'
    },
    'bilstm-attention': {
      name: 'BiLSTM + Attention', accuracy: 0.928, f1: 0.915, precision: 0.921, recall: 0.910,
      latency: [10, 22], params: '8.1M', recommend: 5, avatar: 'BA', type: 'Bidirectional LSTM + Attention',
      desc: '双向 LSTM 结合注意力机制，精准捕捉情感关键词，综合性能最优'
    },
    'bilstm-self-attention': {
      name: 'BiLSTM + Self-Attention', accuracy: 0.914, f1: 0.901, precision: 0.908, recall: 0.895,
      latency: [12, 25], params: '9.4M', recommend: 4, avatar: 'BS', type: 'Bidirectional LSTM + Self-Attention',
      desc: '双向 LSTM 配合自注意力，全局语境建模能力更强'
    },
    'bigru-self-attention': {
      name: 'BiGRU + Self-Attention', accuracy: 0.911, f1: 0.897, precision: 0.904, recall: 0.891,
      latency: [9, 20], params: '6.8M', recommend: 3, avatar: 'GS', type: 'Bidirectional GRU + Self-Attention',
      desc: 'GRU 参数更少，推理速度更快，适合资源受限场景'
    },
    'bert': {
      name: 'BERT', accuracy: 0.947, f1: 0.941, precision: 0.944, recall: 0.938,
      latency: [40, 70], params: '102M', recommend: 4, avatar: 'B', type: 'BERT (bert-base-chinese) fine-tuned',
      desc: '大规模预训练语言模型微调，准确率最高，推理开销较大'
    }
  };
  if (!window.MODELS) window.MODELS = models;
  return models;
}

function getCompareModelOrder(models) {
  const preferred = ['bilstm-attention', 'lstm', 'bilstm-self-attention', 'bigru-self-attention', 'bert'];
  const known = preferred.filter(id => models[id]);
  const rest = Object.keys(models).filter(id => !known.includes(id));
  return [...known, ...rest];
}

function ensureCompareSelection(models) {
  const available = getCompareModelOrder(models);
  if (!Array.isArray(State.compareSelectedModels)) State.compareSelectedModels = [];
  State.compareSelectedModels = State.compareSelectedModels.filter(id => available.includes(id));
  if (!State.compareSelectedModels.length) {
    State.compareSelectedModels = available.slice();
  }
}

function updateCompareSelectedCount() {
  const countEl = document.getElementById('compare-selected-count');
  if (!countEl) return;
  countEl.textContent = `已选择 ${State.compareSelectedModels.length} 个模型`;

  const hintEl = document.getElementById('compare-model-hint');
  if (hintEl) {
    if (State.compareSelectedModels.length === 0) {
      hintEl.textContent = '请至少选择 1 个模型进行对比';
      hintEl.style.color = 'var(--accent-danger)';
    } else {
      hintEl.textContent = '可多选模型并行分析';
      hintEl.style.color = 'var(--text-muted)';
    }
  }
}

function updateCompareInputCounter() {
  const input = document.getElementById('compare-input');
  const counter = document.getElementById('compare-char-count');
  if (!input || !counter) return;

  const maxLen = 5000;
  if (input.value.length > maxLen) {
    input.value = input.value.slice(0, maxLen);
  }
  counter.textContent = `${input.value.length} / ${maxLen} 字符`;
}

function updateCompareAnalyzeButtonState() {
  const btn = document.getElementById('compare-analyze-btn');
  const input = document.getElementById('compare-input');
  if (!btn || !input) return;

  const hasText = !!input.value.trim();
  const hasModel = State.compareSelectedModels.length > 0;
  btn.disabled = State.compareRunning || !hasText || !hasModel;
}

function initCompareInputHandlers() {
  const compareInput = document.getElementById('compare-input');
  if (!compareInput) return;

  if (!compareInput.dataset.boundEnter) {
    compareInput.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        window.startCompareAnalysis();
      }
    });
    compareInput.dataset.boundEnter = '1';
  }

  if (!compareInput.dataset.boundInput) {
    compareInput.addEventListener('input', () => {
      updateCompareInputCounter();
      updateCompareAnalyzeButtonState();
    });
    compareInput.dataset.boundInput = '1';
  }

  updateCompareInputCounter();
}

window.selectAllCompareModels = function() {
  const models = getCompareModels();
  State.compareSelectedModels = getCompareModelOrder(models).slice();
  renderCompareModelSelector(models);
  document.querySelectorAll('#model-compare-grid .model-card').forEach(card => {
    card.classList.add('selected');
  });
  updateCompareAnalyzeButtonState();
};

window.clearCompareModels = function() {
  State.compareSelectedModels = [];
  const models = getCompareModels();
  renderCompareModelSelector(models);
  document.querySelectorAll('#model-compare-grid .model-card').forEach(card => {
    card.classList.remove('selected');
  });
  updateCompareAnalyzeButtonState();
};

function renderCompareModelSelector(models) {
  const selector = document.getElementById('compare-model-selector');
  if (!selector) return;
  const order = getCompareModelOrder(models);
  selector.innerHTML = order.map((id) => {
    const m = models[id];
    const checked = State.compareSelectedModels.includes(id) ? 'checked' : '';
    return `
      <label class="compare-model-option">
        <input type="checkbox" class="compare-model-checkbox" value="${id}" ${checked}
          onchange="toggleCompareModelSelection('${id}', this.checked)">
        <span>${m.name}</span>
      </label>`;
  }).join('');
  updateCompareSelectedCount();
}

window.toggleCompareModelSelection = function(modelId, forceChecked) {
  const models = getCompareModels();
  const available = Object.keys(models);
  if (!available.includes(modelId)) return;

  let checked = forceChecked;
  if (typeof checked !== 'boolean') {
    checked = !State.compareSelectedModels.includes(modelId);
  }

  if (checked) {
    if (!State.compareSelectedModels.includes(modelId)) State.compareSelectedModels.push(modelId);
  } else {
    State.compareSelectedModels = State.compareSelectedModels.filter(id => id !== modelId);
  }

  renderCompareModelSelector(models);
  document.querySelectorAll('#model-compare-grid .model-card').forEach(card => {
    card.classList.toggle('selected', State.compareSelectedModels.includes(card.dataset.model));
  });
  updateCompareAnalyzeButtonState();
};

function getSelectedCompareModelIds(models) {
  const available = getCompareModelOrder(models);
  return State.compareSelectedModels.filter(id => available.includes(id));
}

function onComparePage() {
  const grid = document.getElementById('model-compare-grid');
  if (!grid) return;

  const models = getCompareModels();
  ensureCompareSelection(models);
  renderCompareModelSelector(models);

  if (!grid.childElementCount) {
    const colMap = { 5: '#00d4ff', 4: '#a78bfa', 3: '#06ffa5', 2: '#ff6b35', 1: '#ff2d55' };
    const order = getCompareModelOrder(models);
    grid.innerHTML = order.map((id) => {
      const m = models[id];
      return `
      <div class="model-card ${State.compareSelectedModels.includes(id) ? 'selected' : ''}" data-model="${id}" onclick="toggleCompareModelSelection('${id}')">
        <div class="model-card-header">
          <div class="model-avatar">${m.avatar}</div>
          <div><div class="model-name">${m.name}</div><div class="model-type text-muted text-xs">${m.type}</div></div>
        </div>
        <p class="text-sm text-secondary mb-16">${m.desc}</p>
        <div class="model-metrics">
          <div class="model-metric-row"><span class="model-metric-name">准确率</span><span class="model-metric-val">${(m.accuracy*100).toFixed(1)}%</span></div>
          <div class="model-metric-row"><span class="model-metric-name">F1 Score</span><span class="model-metric-val">${(m.f1*100).toFixed(1)}%</span></div>
          <div class="model-metric-row"><span class="model-metric-name">参数量</span><span class="model-metric-val">${m.params}</span></div>
          <div class="model-metric-row"><span class="model-metric-name">延迟(ms)</span><span class="model-metric-val">${m.latency[0]}-${m.latency[1]}</span></div>
        </div>
        <div class="compare-bar-wrap">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">准确率</div>
          <div class="compare-bar"><div class="compare-bar-fill" style="width:${m.accuracy*100}%;background:${colMap[m.recommend] || '#00d4ff'}"></div></div>
        </div>
      </div>`;
    }).join('');
  } else {
    document.querySelectorAll('#model-compare-grid .model-card').forEach(card => {
      card.classList.toggle('selected', State.compareSelectedModels.includes(card.dataset.model));
    });
  }

  initCompareInputHandlers();
  updateCompareAnalyzeButtonState();
}

window.loadCompareExample = function() {
  const examples = [
    '这家店的服务非常热情，产品质量也很好，下次还会继续购买。',
    '物流速度一般，包装正常，整体体验中规中矩。',
    '客服回复很慢，商品还有破损，这次购物体验比较差。'
  ];
  const input = document.getElementById('compare-input');
  if (!input) return;
  input.value = examples[Math.floor(Math.random() * examples.length)];
  updateCompareInputCounter();
  updateCompareAnalyzeButtonState();
};

window.startCompareAnalysis = async function() {
  const input = document.getElementById('compare-input');
  const btn = document.getElementById('compare-analyze-btn');
  const tbody = document.getElementById('compare-result-tbody');
  const text = ((input && input.value) || '').trim();

  if (!text) {
    showToast('warn', '请先输入文本', '对比分析文本不能为空');
    return;
  }
  if (!tbody || !btn) return;

  if (typeof window.analyzeSentiment !== 'function') {
    showToast('error', '对比功能初始化失败', '分析引擎未加载，请刷新页面重试');
    return;
  }

  const models = getCompareModels();
  ensureCompareSelection(models);
  const modelIds = getSelectedCompareModelIds(models);
  if (!modelIds.length) {
    showToast('warn', '请先勾选模型', '至少选择 1 个模型参与对比');
    updateCompareAnalyzeButtonState();
    return;
  }

  State.compareRunning = true;
  updateCompareAnalyzeButtonState();
  btn.textContent = '⏳ 对比中...';
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:28px 12px">正在并行调用多模型，请稍候...</td></tr>';

  const labelMap = { positive: '正面', neutral: '中性', negative: '负面' };
  const colorMap = { positive: '#06ffa5', neutral: '#a78bfa', negative: '#ff2d55' };

  try {
    const results = await Promise.all(modelIds.map(async (modelId) => {
      try {
        return await window.analyzeSentiment(text, modelId);
      } catch (error) {
        return {
          modelId,
          modelName: (models[modelId] && models[modelId].name) || modelId,
          error: (error && error.message) || '分析失败'
        };
      }
    }));

    const successCount = results.filter(r => !r.error).length;
    tbody.innerHTML = results.map((r) => {
      if (r.error) {
        return `
          <tr>
            <td>${r.modelName}</td>
            <td colspan="6" style="color:var(--accent-danger)">❌ ${r.error}</td>
          </tr>`;
      }

      const sentiment = r.sentiment || 'neutral';
      const probs = r.probabilities || { positive: 0, neutral: 0, negative: 0 };
      return `
        <tr>
          <td><strong>${r.modelName || (models[r.modelId] || {}).name || r.modelId}</strong></td>
          <td><span class="tag" style="color:${colorMap[sentiment]};background:${colorMap[sentiment]}18;border-color:${colorMap[sentiment]}44">${labelMap[sentiment] || '未知'}</span></td>
          <td class="font-mono" style="color:${colorMap[sentiment]}">${((r.confidence || 0) * 100).toFixed(1)}%</td>
          <td class="font-mono">${((probs.positive || 0) * 100).toFixed(1)}%</td>
          <td class="font-mono">${((probs.neutral || 0) * 100).toFixed(1)}%</td>
          <td class="font-mono">${((probs.negative || 0) * 100).toFixed(1)}%</td>
          <td class="font-mono">${r.inferenceMs || '-'}ms</td>
        </tr>`;
    }).join('');

    if (successCount > 0) {
      showToast('success', '模型对比完成', `已输出 ${successCount} 个模型结果`);
    } else {
      showToast('error', '模型对比失败', '所有模型都未返回有效结果');
    }
  } catch {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--accent-danger);padding:28px 12px">模型对比执行失败，请重试</td></tr>';
    showToast('error', '模型对比失败', '执行过程中发生异常');
  } finally {
    State.compareRunning = false;
    btn.textContent = '⚖️ 开始模型对比';
    updateCompareAnalyzeButtonState();
  }
};

// ── Metrics Page ──────────────────────────────────────────────────
function onMetricsPage() {
  buildConfusionMatrix();
  setTimeout(() => { drawCmChart(); drawRocChart(); drawLossAccCharts(); }, 100);
}

// ── Visualization Page ────────────────────────────────────────────
function onVizPage() {
  setTimeout(() => { drawVisualizationCharts(); drawWordCloud(); }, 100);
}

// ── Dataset Page ──────────────────────────────────────────────────
function onDatasetPage() {
  setTimeout(() => drawDatasetCharts(), 100);
  refreshSamples();
}

window.refreshSamples = function() {
  const list = document.getElementById('sample-list');
  if (!list) return;
  const colMap   = { positive: '#06ffa5', negative: '#ff2d55', neutral: '#a78bfa' };
  const labelMap = { positive: '正面', negative: '负面', neutral: '中性' };
  list.innerHTML = window.getSamples().map(s => `
    <div class="data-sample-row">
      <div class="data-sample-idx">${s.idx}</div>
      <div class="data-sample-text">${s.text}</div>
      <span class="tag" style="color:${colMap[s.label]};background:${colMap[s.label]}18;border-color:${colMap[s.label]}44;flex-shrink:0">${labelMap[s.label]}</span>
    </div>`).join('');
};

window.switchDsTab = function(split) {
  const data = { train: [3600, 3000, 3000], valid: [450, 375, 375], test: [450, 375, 375] }[split] || [0,0,0];
  const c = Chart.getChart('ds-dist-chart');
  if (c) { c.data.datasets[0].data = data; c.update(); }
};

// ── Stream Page ───────────────────────────────────────────────────
function onStreamPage() {
  setTimeout(() => initStreamCharts(), 100);
}

window.toggleStream = function() {
  if (State.streamRunning) {
    clearInterval(State.streamInterval);
    State.streamRunning = false;
    document.getElementById('stream-btn').textContent = '▶ 开始实时流';
    document.getElementById('stream-btn').className = 'btn btn-primary';
  } else {
    State.streamRunning = true;
    document.getElementById('stream-btn').textContent = '⏹ 停止';
    document.getElementById('stream-btn').className = 'btn btn-danger';
    runStream();
  }
};

function runStream() {
  const speed = parseInt(document.getElementById('speed-slider').value) || 5;
  document.getElementById('speed-val').textContent = speed + 'x';
  const interval = Math.max(200, 1500 - speed * 130);

  State.streamInterval = setInterval(async () => {
    if (!State.streamRunning) return;
    const { text, sentiment } = window.getStreamText();
    const result = await window.analyzeSentiment(text, State.selectedModel);
    State.streamCounts[result.sentiment]++;

    const total = State.streamCounts.positive + State.streamCounts.neutral + State.streamCounts.negative;
    const posR = State.streamCounts.positive, neuR = State.streamCounts.neutral, negR = State.streamCounts.negative;

    // Update stats
    const idx = total === 0 ? 0 : ((posR - negR) / total * 100);
    const el = document.getElementById('st-index');
    if (el) { el.textContent = idx.toFixed(1); el.style.color = idx > 0 ? '#06ffa5' : idx < 0 ? '#ff2d55' : '#a78bfa'; }
    const prEl = document.getElementById('st-pos-rate');
    if (prEl) prEl.textContent = total > 0 ? (posR / total * 100).toFixed(1) + '%' : '—';
    const naEl = document.getElementById('st-neg-alert');
    if (naEl && negR > 0 && negR % 5 === 0) { naEl.textContent = negR; }
    const prEl2 = document.getElementById('st-processed');
    if (prEl2) prEl2.textContent = total;

    // Update tag counters
    ['pos', 'neu', 'neg'].forEach((k, i) => {
      const tag = document.getElementById(`stream-${k}-tag`);
      const counts = [posR, neuR, negR];
      const names  = ['正面', '中性', '负面'];
      if (tag) tag.textContent = `${names[i]}: ${counts[i]}`;
    });

    // Feed item
    addStreamItem(result);
    updateStreamCharts(posR, neuR, negR);

  }, interval);
}

function addStreamItem(r) {
  const feed = document.getElementById('stream-feed');
  if (!feed) return;
  const ph = feed.querySelector('[style*="padding:40px"]');
  if (ph) ph.remove();

  const colMap   = { positive: '#06ffa5', negative: '#ff2d55', neutral: '#a78bfa' };
  const emojiMap = { positive: '😊', negative: '😞', neutral: '😐' };
  const labelMap = { positive: '正面', negative: '负面', neutral: '中性' };

  const item = document.createElement('div');
  item.className = 'stream-item';
  item.innerHTML = `
    <div class="stream-text">${r.text.slice(0, 60)}${r.text.length > 60 ? '...' : ''}</div>
    <div class="stream-meta">
      <span class="tag" style="color:${colMap[r.sentiment]};background:${colMap[r.sentiment]}18;border-color:${colMap[r.sentiment]}44">${emojiMap[r.sentiment]} ${labelMap[r.sentiment]}</span>
      <span class="stream-time">${new Date().toLocaleTimeString()}</span>
    </div>`;
  feed.insertBefore(item, feed.firstChild);
  while (feed.children.length > 30) feed.removeChild(feed.lastChild);
}

window.clearStream = function() {
  const feed = document.getElementById('stream-feed');
  if (feed) feed.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)"><div style="font-size:32px;margin-bottom:12px">⚡</div>点击"开始实时流"以启动模拟数据流</div>';
  State.streamCounts = { positive: 0, neutral: 0, negative: 0 };
  initStreamCharts();
};

// ── Batch Page ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const ta = document.getElementById('batch-input');
  if (ta) ta.addEventListener('input', () => {
    const lines = ta.value.split('\n').filter(l => l.trim());
    document.getElementById('batch-count').textContent = `${lines.length} 行`;
  });
});

window.handleFileSelect = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const text = ev.target.result;
    const lines = text.split('\n').filter(l => l.trim());
    document.getElementById('batch-input').value = lines.join('\n');
    document.getElementById('batch-count').textContent = `${lines.length} 行`;
    showToast('success', `已加载文件`, `${lines.length} 行文本`);
  };
  reader.readAsText(file, 'utf-8');
};

window.handleDrop = function(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) {
    const input = document.getElementById('file-input');
    Object.defineProperty(input, 'files', { value: e.dataTransfer.files });
    handleFileSelect({ target: { files: e.dataTransfer.files } });
  }
};

window.startBatchAnalysis = function() {
  const lines = document.getElementById('batch-input').value.split('\n').filter(l => l.trim());
  if (!lines.length) { showToast('warn', '请先输入文本', '每行一条文本'); return; }

  State.batchItems  = lines;
  State.batchResults = [];
  State.batchRunning = true;

  document.getElementById('batch-progress-card').classList.remove('hidden');
  document.getElementById('batch-results-card').classList.add('hidden');

  let idx = 0;
  let pos = 0, neu = 0, neg = 0;

  const next = async () => {
    if (!State.batchRunning || idx >= lines.length) {
      State.batchRunning = false;
      document.getElementById('batch-results-card').classList.remove('hidden');
      renderBatchResults(State.batchResults);
      showToast('success', '批量分析完成', `${lines.length} 条 · 正面${pos} 中性${neu} 负面${neg}`);
      return;
    }
    const r = await window.analyzeSentiment(lines[idx], State.selectedModel);
    State.batchResults.push(r);
    r.sentiment === 'positive' ? pos++ : r.sentiment === 'negative' ? neg++ : neu++;
    idx++;

    const pct = (idx / lines.length * 100).toFixed(0);
    document.getElementById('batch-fill').style.width = pct + '%';
    document.getElementById('batch-progress-text').textContent = `${idx} / ${lines.length}`;
    document.getElementById('b-pos').textContent = pos;
    document.getElementById('b-neu').textContent = neu;
    document.getElementById('b-neg').textContent = neg;
    document.getElementById('b-total').textContent = idx;

    setTimeout(next, 50);
  };
  next();
};

function renderBatchResults(results) {
  const tbody = document.getElementById('batch-tbody');
  if (!tbody) return;
  const colMap = { positive: '#06ffa5', negative: '#ff2d55', neutral: '#a78bfa' };
  const labelMap = { positive: '正面', negative: '负面', neutral: '中性' };
  tbody.innerHTML = results.map((r, i) => `
    <tr>
      <td class="font-mono text-muted">${i + 1}</td>
      <td style="max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.text}">${r.text}</td>
      <td><span class="sentiment-badge sentiment-${r.sentiment}">${labelMap[r.sentiment]}</span></td>
      <td class="font-mono" style="color:${colMap[r.sentiment]}">${(r.confidence * 100).toFixed(1)}%</td>
      <td class="text-xs text-muted">${r.modelName}</td>
    </tr>`).join('');
}

window.stopBatch = function() { State.batchRunning = false; showToast('info', '已停止', '批量分析已中断'); };

window.exportBatch = function(fmt) {
  if (!State.batchResults.length) { showToast('warn', '没有数据', '请先完成批量分析'); return; }
  if (fmt === 'csv') {
    const csv = ['文本,情感,置信度,模型', ...State.batchResults.map(r =>
      `"${r.text.replace(/"/g,'""')}",${r.label},${(r.confidence*100).toFixed(1)}%,${r.modelName}`)].join('\n');
    downloadFile('batch_results.csv', csv, 'text/csv');
  } else {
    downloadFile('batch_results.json', JSON.stringify(State.batchResults, null, 2), 'application/json');
  }
  showToast('success', '导出成功');
};

// ── Training Monitor ──────────────────────────────────────────────
function onTrainingPage() {
  setTimeout(() => initTrainingChart(), 100);
}

window.toggleTraining = function() {
  if (State.trainingRunning) {
    clearInterval(State.trainingInterval);
    State.trainingRunning = false;
    document.getElementById('tr-start-btn').textContent = '▶ 模拟训练';
    addLog('info', '训练已手动停止');
  } else {
    State.trainingRunning = true;
    State.trainingEpoch   = 0;
    document.getElementById('tr-start-btn').textContent = '⏹ 停止';
    initTrainingChart();
    clearLog();
    addLog('info', `开始训练 · 模型: ${document.getElementById('tr-model-sel').value}`);
    addLog('info', `超参数 · Epochs: ${document.getElementById('tr-epochs').value} LR: ${document.getElementById('tr-lr').value}`);
    simulateTraining();
  }
};

function simulateTraining() {
  const totalEpochs = parseInt(document.getElementById('tr-epochs').value) || 10;
  let epoch = 0;
  let tl = 1.25, vl = 1.35, ta = 0.44, va = 0.40;

  State.trainingInterval = setInterval(() => {
    if (!State.trainingRunning || epoch >= totalEpochs) {
      clearInterval(State.trainingInterval);
      State.trainingRunning = false;
      document.getElementById('tr-start-btn').textContent = '▶ 模拟训练';
      addLog('success', `训练完成！最终验证准确率: ${(va * 100).toFixed(2)}%`);
      return;
    }
    epoch++;
    tl *= (0.70 + Math.random() * 0.08); vl *= (0.73 + Math.random() * 0.07);
    ta = Math.min(0.998, ta + 0.06 + Math.random() * 0.025);
    va = Math.min(0.992, va + 0.055 + Math.random() * 0.02);

    pushTrainingPoint(epoch, tl, vl, ta, va);
    document.getElementById('tr-epoch').textContent = `${epoch}/${totalEpochs}`;
    document.getElementById('tr-loss').textContent  = tl.toFixed(4);
    document.getElementById('tr-acc').textContent   = (va * 100).toFixed(2) + '%';
    document.getElementById('tr-epoch-bar').style.width = (epoch / totalEpochs * 100) + '%';
    document.getElementById('tr-progress-label').textContent = `${epoch} / ${totalEpochs}`;

    const remaining = (totalEpochs - epoch) * 1.5;
    document.getElementById('tr-eta').textContent = remaining.toFixed(0) + 's';

    addLog('', `Epoch ${epoch}/${totalEpochs} · loss: ${tl.toFixed(4)} · val_loss: ${vl.toFixed(4)} · acc: ${(ta*100).toFixed(2)}% · val_acc: ${(va*100).toFixed(2)}%`);
  }, 1500);
}

function addLog(type, msg) {
  const log = document.getElementById('training-log');
  if (!log) return;
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  const ts = new Date().toLocaleTimeString();
  line.innerHTML = `<span class="log-prefix">[${ts}]</span>${msg}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

window.clearLog = function() {
  const log = document.getElementById('training-log');
  if (log) log.innerHTML = '<div class="log-line"><span class="log-prefix">[系统]</span>日志已清空</div>';
};

// ── Settings ──────────────────────────────────────────────────────
window.switchConfig = function(panel) {
  document.querySelectorAll('.config-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.config-nav-item').forEach(n => n.classList.remove('active'));
  const panelEl = document.getElementById(`config-${panel}`);
  if (panelEl) panelEl.classList.add('active');
  event.currentTarget.classList.add('active');
};

// ── Tabs ──────────────────────────────────────────────────────────
window.switchTab = function(pageKey, tabId) {
  const allTabs = document.querySelectorAll(`#page-${pageKey} .tab-content`);
  const allBtns = document.querySelectorAll(`#page-${pageKey} .tab-btn`);
  allTabs.forEach(t => t.classList.remove('active'));
  allBtns.forEach(b => b.classList.remove('active'));
  const target = document.getElementById(`${pageKey}-${tabId}`);
  if (target) target.classList.add('active');
  if (event && event.currentTarget) event.currentTarget.classList.add('active');
};

// ...报告中心相关代码已移除...

// ── Keyboard shortcuts ────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'Enter' && State.currentPage === 'analysis') { startAnalysis(); }
});

// ── API docs ──────────────────────────────────────────────────────
window.copyCode = function(btn) {
  const block = btn.parentElement;
  const code  = block.innerText.replace('复制', '').replace('已复制 ✓', '').trim();
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = '已复制 ✓';
    setTimeout(() => btn.textContent = '复制', 2000);
  }).catch(() => showToast('warn', '请手动复制'));
};

// ── Utility ───────────────────────────────────────────────────────
function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60)    return '刚刚';
  if (diff < 3600)  return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  return d.toLocaleDateString('zh-CN');
}

function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  navigate('home');

  // Pre-initialize compare selector to avoid empty state before first navigation.
  const compareModels = getCompareModels();
  ensureCompareSelection(compareModels);
  renderCompareModelSelector(compareModels);
  initCompareInputHandlers();
  updateCompareAnalyzeButtonState();

  // Animate hero stats
  setTimeout(() => {
    const el = document.getElementById('stat-accuracy');
    if (!el) return;
    let v = 0; const target = 94.7;
    const iv = setInterval(() => {
      v += 2.1; if (v >= target) { v = target; clearInterval(iv); }
      el.textContent = v.toFixed(1) + '%';
    }, 30);
  }, 600);

  showToast('success', '系统就绪', '情感智析云平台已启动');
});
