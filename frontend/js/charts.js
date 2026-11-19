/* ========================================
  情感智析云平台 - Chart Visualizations
   Powered by Chart.js 4.x
   ======================================== */

'use strict';

// ── Global chart defaults ────────────────────────────────────────
Chart.defaults.color = '#8ba3cc';
Chart.defaults.borderColor = 'rgba(100,150,200,0.1)';
Chart.defaults.font.family = "'Inter', 'Segoe UI', sans-serif";
Chart.defaults.responsive = true;
Chart.defaults.maintainAspectRatio = false;

const POS_COLOR  = '#06ffa5';
const NEU_COLOR  = '#a78bfa';
const NEG_COLOR  = '#ff2d55';
const BLUE_COLOR = '#00d4ff';

const charts = {};

function mkGrad(ctx, colors, dir = 'v') {
  const g = dir === 'v'
    ? ctx.createLinearGradient(0, 0, 0, 300)
    : ctx.createLinearGradient(0, 0, 300, 0);
  colors.forEach(([stop, color]) => g.addColorStop(stop, color));
  return g;
}

// ── Helper: destroy & rebuild ────────────────────────────────────
function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

// ── Page: Results ────────────────────────────────────────────────
window.drawResultChart = function(pos, neu, neg) {
  destroyChart('result');
  const el = document.getElementById('result-chart');
  if (!el) return;
  charts['result'] = new Chart(el, {
    type: 'doughnut',
    data: {
      labels: ['正面 Positive', '中性 Neutral', '负面 Negative'],
      datasets: [{
        data: [pos * 100, neu * 100, neg * 100],
        backgroundColor: [POS_COLOR + 'cc', NEU_COLOR + 'cc', NEG_COLOR + 'cc'],
        borderColor: [POS_COLOR, NEU_COLOR, NEG_COLOR],
        borderWidth: 2,
        hoverOffset: 8
      }]
    },
    options: {
      cutout: '68%',
      plugins: {
        legend: { position: 'bottom', labels: { padding: 16, boxWidth: 12, font: { size: 12 } } },
        tooltip: {
          callbacks: { label: (c) => ` ${c.label}: ${c.parsed.toFixed(1)}%` }
        }
      },
      animation: { animateRotate: true, duration: 1000 }
    }
  });
};

// ── Page: Model Comparison ───────────────────────────────────────
window.drawCompareBarChart = function() {
  destroyChart('compare-bar');
  const el = document.getElementById('compare-bar-chart');
  if (!el) return;
  const names = Object.values(window.MODELS).map(m => m.name);
  const accs  = Object.values(window.MODELS).map(m => (m.accuracy * 100).toFixed(1));
  const f1s   = Object.values(window.MODELS).map(m => (m.f1 * 100).toFixed(1));
  charts['compare-bar'] = new Chart(el, {
    type: 'bar',
    data: {
      labels: names,
      datasets: [
        { label: '准确率%', data: accs, backgroundColor: BLUE_COLOR + '88', borderColor: BLUE_COLOR, borderWidth: 1.5, borderRadius: 6 },
        { label: 'F1 Score%', data: f1s, backgroundColor: POS_COLOR + '88', borderColor: POS_COLOR, borderWidth: 1.5, borderRadius: 6 }
      ]
    },
    options: {
      plugins: { legend: { position: 'top' } },
      scales: {
        y: {
          min: 80, max: 100,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { callback: v => v + '%' }
        },
        x: { grid: { display: false } }
      }
    }
  });
};

window.drawCompareRadar = function() {
  destroyChart('compare-radar');
  const el = document.getElementById('compare-radar');
  if (!el) return;
  charts['compare-radar'] = new Chart(el, {
    type: 'radar',
    data: {
      labels: ['准确率', 'F1分数', '精确率', '召回率', '速度', '参数效率'],
      datasets: [
        { label: 'BiLSTM-Attn', data: [92.8, 91.5, 92.1, 91.0, 85, 75], borderColor: BLUE_COLOR, backgroundColor: BLUE_COLOR + '22', pointBackgroundColor: BLUE_COLOR },
        { label: 'BERT',        data: [94.7, 94.1, 94.4, 93.8, 40, 20], borderColor: NEG_COLOR,  backgroundColor: NEG_COLOR  + '22', pointBackgroundColor: NEG_COLOR  },
        { label: 'LSTM',        data: [87.8, 87.1, 87.4, 86.9, 95, 95], borderColor: POS_COLOR,  backgroundColor: POS_COLOR  + '22', pointBackgroundColor: POS_COLOR  }
      ]
    },
    options: {
      scales: {
        r: {
          min: 0, max: 100,
          grid: { color: 'rgba(255,255,255,0.07)' },
          tickDisplay: false,
          angleLines: { color: 'rgba(255,255,255,0.06)' },
          pointLabels: { font: { size: 12 }, color: '#8ba3cc' }
        }
      },
      plugins: { legend: { position: 'bottom' } }
    }
  });
};

// ── Page: Metrics ─────────────────────────────────────────────────
window.buildConfusionMatrix = function() {
  const cm = document.getElementById('cm-wrap');
  if (!cm) return;
  const data = [
    [938, 42, 20],
    [38, 876, 60],
    [28, 48, 916]
  ];
  const labels = ['正面', '中性', '负面'];
  let html = '<div></div>' + labels.map(l => `<div class="cm-header">${l}</div>`).join('');
  data.forEach((row, ri) => {
    html += `<div class="cm-label-cell">${labels[ri]}</div>`;
    row.forEach((v, ci) => {
      const cls = ri === ci ? 'cm-cell cm-diagonal' : 'cm-cell cm-off';
      html += `<div class="${cls}" title="${labels[ri]}→${labels[ci]}: ${v}">${v}</div>`;
    });
  });
  cm.innerHTML = html;
};

window.drawCmChart = function() {
  destroyChart('cm');
  const el = document.getElementById('cm-chart');
  if (!el) return;
  charts['cm'] = new Chart(el, {
    type: 'bar',
    data: {
      labels: ['正面', '中性', '负面'],
      datasets: [
        { label: '→正面', data: [938, 38, 28], backgroundColor: POS_COLOR + '88' },
        { label: '→中性', data: [42, 876, 48], backgroundColor: NEU_COLOR + '88' },
        { label: '→负面', data: [20, 60, 916], backgroundColor: NEG_COLOR + '88' }
      ]
    },
    options: {
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
};

window.drawRocChart = function() {
  destroyChart('roc');
  const el = document.getElementById('roc-chart');
  if (!el) return;
  const rocPts = (auc) => {
    const pts = [{ x: 0, y: 0 }];
    for (let i = 1; i <= 20; i++) {
      const fpr = i / 20;
      const tpr = Math.min(1, Math.pow(fpr, 1 / (auc / 0.5)));
      pts.push({ x: fpr, y: tpr });
    }
    pts.push({ x: 1, y: 1 });
    return pts;
  };
  charts['roc'] = new Chart(el, {
    type: 'line',
    data: {
      datasets: [
        { label: '正面 (AUC=0.978)', data: rocPts(0.978), borderColor: POS_COLOR, fill: false, tension: 0.4, pointRadius: 0 },
        { label: '中性 (AUC=0.951)', data: rocPts(0.951), borderColor: NEU_COLOR, fill: false, tension: 0.4, pointRadius: 0 },
        { label: '负面 (AUC=0.963)', data: rocPts(0.963), borderColor: NEG_COLOR, fill: false, tension: 0.4, pointRadius: 0 },
        { label: '随机基线', data: [{x:0,y:0},{x:1,y:1}], borderColor: 'rgba(255,255,255,0.2)', borderDash: [4,4], fill: false, pointRadius: 0 }
      ]
    },
    options: {
      parsing: false,
      scales: {
        x: { type: 'linear', min: 0, max: 1, title: { display: true, text: 'False Positive Rate' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { min: 0, max: 1, title: { display: true, text: 'True Positive Rate' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      },
      plugins: { legend: { position: 'bottom' } }
    }
  });
};

function lossAccData(epochs = 10) {
  const tLoss = [], vLoss = [], tAcc = [], vAcc = [];
  let tl = 1.2, vl = 1.3, ta = 0.45, va = 0.42;
  for (let i = 0; i < epochs; i++) {
    tl *= (0.72 + Math.random() * 0.05); vl *= (0.76 + Math.random() * 0.05);
    ta = Math.min(0.995, ta + 0.06 + Math.random() * 0.03);
    va = Math.min(0.990, va + 0.055 + Math.random() * 0.025);
    tLoss.push(+tl.toFixed(4)); vLoss.push(+vl.toFixed(4));
    tAcc.push( +ta.toFixed(4)); vAcc.push( +va.toFixed(4));
  }
  return { tLoss, vLoss, tAcc, vAcc };
}

window.drawLossAccCharts = function() {
  destroyChart('loss'); destroyChart('acc');
  const lossEl = document.getElementById('loss-chart');
  const accEl  = document.getElementById('acc-chart');
  const { tLoss, vLoss, tAcc, vAcc } = lossAccData(10);
  const labels = Array.from({length: 10}, (_, i) => `Epoch ${i+1}`);
  if (lossEl) charts['loss'] = new Chart(lossEl, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Train Loss', data: tLoss, borderColor: BLUE_COLOR, backgroundColor: BLUE_COLOR + '18', fill: true, tension: 0.4, pointRadius: 3 },
        { label: 'Val Loss',   data: vLoss, borderColor: NEG_COLOR,  backgroundColor: NEG_COLOR  + '18', fill: true, tension: 0.4, pointRadius: 3 }
      ]
    },
    options: { scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } }, plugins: { legend: { position: 'top' } } }
  });
  if (accEl) charts['acc'] = new Chart(accEl, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Train Acc', data: tAcc, borderColor: POS_COLOR, backgroundColor: POS_COLOR + '18', fill: true, tension: 0.4, pointRadius: 3 },
        { label: 'Val Acc',   data: vAcc, borderColor: NEU_COLOR, backgroundColor: NEU_COLOR + '18', fill: true, tension: 0.4, pointRadius: 3 }
      ]
    },
    options: { scales: { y: { min: 0.4, max: 1, ticks: { callback: v => (v*100).toFixed(0)+'%' }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } }, plugins: { legend: { position: 'top' } } }
  });
};

// ── Page: Stream ──────────────────────────────────────────────────
window.initStreamCharts = function() {
  destroyChart('stream-line'); destroyChart('stream-pie');
  const lineEl = document.getElementById('stream-chart');
  const pieEl  = document.getElementById('stream-pie');
  if (lineEl) {
    const labels = Array.from({length: 20}, (_, i) => i + 1);
    charts['stream-line'] = new Chart(lineEl, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '正面', data: Array(20).fill(0), borderColor: POS_COLOR, backgroundColor: POS_COLOR + '15', fill: true, tension: 0.4, pointRadius: 0 },
          { label: '中性', data: Array(20).fill(0), borderColor: NEU_COLOR, backgroundColor: NEU_COLOR + '15', fill: true, tension: 0.4, pointRadius: 0 },
          { label: '负面', data: Array(20).fill(0), borderColor: NEG_COLOR, backgroundColor: NEG_COLOR + '15', fill: true, tension: 0.4, pointRadius: 0 }
        ]
      },
      options: {
        animation: false,
        scales: { y: { min: 0, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } },
        plugins: { legend: { position: 'top' } }
      }
    });
  }
  if (pieEl) {
    charts['stream-pie'] = new Chart(pieEl, {
      type: 'doughnut',
      data: {
        labels: ['正面', '中性', '负面'],
        datasets: [{ data: [1, 1, 1], backgroundColor: [POS_COLOR + 'cc', NEU_COLOR + 'cc', NEG_COLOR + 'cc'], borderWidth: 2, borderColor: [POS_COLOR, NEU_COLOR, NEG_COLOR] }]
      },
      options: { cutout: '60%', animation: false, plugins: { legend: { position: 'bottom' } } }
    });
  }
};

window.updateStreamCharts = function(pos, neu, neg) {
  const lc = charts['stream-line'];
  if (lc) {
    const shift = d => { d.push(d.pop() || 0); return d; };
    lc.data.datasets[0].data.shift(); lc.data.datasets[0].data.push(pos);
    lc.data.datasets[1].data.shift(); lc.data.datasets[1].data.push(neu);
    lc.data.datasets[2].data.shift(); lc.data.datasets[2].data.push(neg);
    lc.update('none');
  }
  const pc = charts['stream-pie'];
  if (pc) {
    pc.data.datasets[0].data = [pos, neu, neg];
    pc.update('none');
  }
};

// ── Page: Visualization ───────────────────────────────────────────
window.drawVisualizationCharts = function() {
  [
    ['viz-pie', () => new Chart(document.getElementById('viz-pie'), {
      type: 'doughnut',
      data: { labels: ['正面', '中性', '负面'], datasets: [{ data: [48, 28, 24], backgroundColor: [POS_COLOR+'cc', NEU_COLOR+'cc', NEG_COLOR+'cc'], borderColor: [POS_COLOR, NEU_COLOR, NEG_COLOR], borderWidth: 2, hoverOffset: 8 }] },
      options: { cutout: '62%', plugins: { legend: { position: 'bottom' } } }
    })],
    ['viz-trend', () => {
      const labels = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
      const pos = [42,45,51,48,55,60,58,63,67,65,70,68];
      const neg = [30,28,25,27,22,20,22,18,16,18,14,15];
      const neu = labels.map((_, i) => 100 - pos[i] - neg[i]);
      return new Chart(document.getElementById('viz-trend'), {
        type: 'bar',
        data: { labels, datasets: [
          { label: '正面', data: pos, backgroundColor: POS_COLOR + '99', borderRadius: 4 },
          { label: '中性', data: neu, backgroundColor: NEU_COLOR + '99', borderRadius: 4 },
          { label: '负面', data: neg, backgroundColor: NEG_COLOR + '99', borderRadius: 4 }
        ]},
        options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' } } }, plugins: { legend: { position: 'top' } } }
      });
    }],
    ['viz-conf', () => {
      const labels = ['50-60','60-70','70-80','80-90','90-100'];
      return new Chart(document.getElementById('viz-conf'), {
        type: 'bar',
        data: { labels, datasets: [{ label: '样本数', data: [120, 280, 540, 820, 1560], backgroundColor: BLUE_COLOR + '88', borderColor: BLUE_COLOR, borderWidth: 1.5, borderRadius: 6 }] },
        options: { scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false }, title: { display: true, text: '置信度区间 (%)' } } }, plugins: { legend: { display: false } } }
      });
    }],
    ['viz-heatmap', () => {
      const hours = Array.from({length: 24}, (_, i) => `${i}时`);
      const posData = hours.map(() => Math.floor(20 + Math.random() * 60));
      const negData = hours.map(() => Math.floor(5 + Math.random() * 30));
      return new Chart(document.getElementById('viz-heatmap'), {
        type: 'line',
        data: { labels: hours, datasets: [
          { label: '正面情感', data: posData, borderColor: POS_COLOR, backgroundColor: POS_COLOR + '22', fill: true, tension: 0.4, pointRadius: 2 },
          { label: '负面情感', data: negData, borderColor: NEG_COLOR, backgroundColor: NEG_COLOR + '22', fill: true, tension: 0.4, pointRadius: 2 }
        ]},
        options: { scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } } }, plugins: { legend: { position: 'top' } } }
      });
    }]
  ].forEach(([id, fn]) => { destroyChart(id); charts[id] = fn(); });
};

window.drawWordCloud = function() {
  const el = document.getElementById('word-cloud');
  if (!el || !window.WORD_CLOUD_DATA) return;
  const maxFreq = Math.max(...window.WORD_CLOUD_DATA.map(w => w.freq));
  const colors = { positive: POS_COLOR, negative: NEG_COLOR, neutral: NEU_COLOR };
  el.innerHTML = window.WORD_CLOUD_DATA.map(({ word, freq, type }) => {
    const size = 12 + (freq / maxFreq) * 28;
    const opacity = 0.5 + (freq / maxFreq) * 0.5;
    return `<span class="wc-word" style="font-size:${size.toFixed(0)}px;color:${colors[type]};opacity:${opacity.toFixed(2)}">${word}</span>`;
  }).join(' ');
};

// ── Page: Dataset ─────────────────────────────────────────────────
window.drawDatasetCharts = function() {
  destroyChart('ds-dist'); destroyChart('ds-len');
  const distEl = document.getElementById('ds-dist-chart');
  const lenEl  = document.getElementById('ds-len-chart');
  if (distEl) charts['ds-dist'] = new Chart(distEl, {
    type: 'bar',
    data: { labels: ['正面', '中性', '负面'], datasets: [{ label: '样本数量', data: [3600, 3000, 3000], backgroundColor: [POS_COLOR + 'bb', NEU_COLOR + 'bb', NEG_COLOR + 'bb'], borderColor: [POS_COLOR, NEU_COLOR, NEG_COLOR], borderWidth: 2, borderRadius: 8 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } } }
  });
  if (lenEl) {
    const bins = ['0-50','51-100','101-150','151-200','201-300','300+'];
    const freq  = [450, 1820, 2940, 2100, 1680, 610];
    charts['ds-len'] = new Chart(lenEl, {
      type: 'bar',
      data: { labels: bins, datasets: [{ label: '文本数量', data: freq, backgroundColor: BLUE_COLOR + '88', borderColor: BLUE_COLOR, borderWidth: 1.5, borderRadius: 6 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false }, title: { display: true, text: '文本长度（字符数）' } } } }
    });
  }
};

// ── Page: Training monitor ────────────────────────────────────────
let trainingChartData = { labels: [], trainLoss: [], valLoss: [], trainAcc: [], valAcc: [] };

window.initTrainingChart = function() {
  destroyChart('training');
  trainingChartData = { labels: [], trainLoss: [], valLoss: [], trainAcc: [], valAcc: [] };
  const el = document.getElementById('training-chart');
  if (!el) return;
  charts['training'] = new Chart(el, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Train Loss', data: [], borderColor: NEG_COLOR, tension: 0.4, yAxisID: 'y1', pointRadius: 3 },
        { label: 'Val Loss',   data: [], borderColor: BLUE_COLOR, tension: 0.4, yAxisID: 'y1', borderDash: [4,4], pointRadius: 3 },
        { label: 'Train Acc',  data: [], borderColor: POS_COLOR, tension: 0.4, yAxisID: 'y2', pointRadius: 3 },
        { label: 'Val Acc',    data: [], borderColor: NEU_COLOR, tension: 0.4, yAxisID: 'y2', borderDash: [4,4], pointRadius: 3 }
      ]
    },
    options: {
      animation: { duration: 300 },
      scales: {
        y1: { type: 'linear', position: 'left', title: { display: true, text: 'Loss' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y2: { type: 'linear', position: 'right', min: 0, max: 1, title: { display: true, text: 'Accuracy' }, grid: { display: false }, ticks: { callback: v => (v*100).toFixed(0)+'%' } },
        x: { grid: { display: false } }
      },
      plugins: { legend: { position: 'top' } }
    }
  });
};

window.pushTrainingPoint = function(epoch, tl, vl, ta, va) {
  const c = charts['training'];
  if (!c) return;
  c.data.labels.push(`Ep${epoch}`);
  c.data.datasets[0].data.push(+tl.toFixed(4));
  c.data.datasets[1].data.push(+vl.toFixed(4));
  c.data.datasets[2].data.push(+ta.toFixed(4));
  c.data.datasets[3].data.push(+va.toFixed(4));
  c.update();
};
