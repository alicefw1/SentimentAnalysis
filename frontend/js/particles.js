/* ========================================
  情感智析云平台 - Neural Network Background Animation
   ======================================== */

(function() {
  'use strict';

  const canvas = document.getElementById('neural-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, nodes = [], edges = [], signals = [], animId;
  let enabled = true;

  const CONFIG = {
    nodeCount: 55,
    nodeRadius: { min: 1.5, max: 3.5 },
    connectionDist: 160,
    maxConnections: 4,
    signalSpeed: 0.003,
    signalCount: 20,
    colors: {
      node: ['rgba(0,212,255,%a)', 'rgba(124,58,237,%a)', 'rgba(6,255,165,%a)', 'rgba(255,107,53,%a)'],
      edge: 'rgba(0,212,255,0.07)',
      signal: ['#00d4ff', '#7c3aed', '#06ffa5', '#ff6b35']
    }
  };

  class Node {
    constructor() {
      this.reset(true);
      this.colorIdx = Math.floor(Math.random() * CONFIG.colors.node.length);
      this.r = CONFIG.nodeRadius.min + Math.random() * (CONFIG.nodeRadius.max - CONFIG.nodeRadius.min);
      this.pulsePhase = Math.random() * Math.PI * 2;
      this.pulseSpeed = 0.02 + Math.random() * 0.03;
    }
    reset(init) {
      this.x = Math.random() * (W || window.innerWidth);
      this.y = Math.random() * (H || window.innerHeight);
      this.vx = (Math.random() - 0.5) * 0.25;
      this.vy = (Math.random() - 0.5) * 0.25;
      if (!init) { this.pulsePhase = Math.random() * Math.PI * 2; }
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.pulsePhase += this.pulseSpeed;
      if (this.x < 0 || this.x > W) this.vx *= -1;
      if (this.y < 0 || this.y > H) this.vy *= -1;
      this.x = Math.max(0, Math.min(W, this.x));
      this.y = Math.max(0, Math.min(H, this.y));
    }
    draw() {
      const pulse = Math.sin(this.pulsePhase) * 0.3 + 0.7;
      const baseColor = CONFIG.colors.node[this.colorIdx];
      const alpha = (0.4 + pulse * 0.4).toFixed(2);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * (0.85 + pulse * 0.15), 0, Math.PI * 2);
      ctx.fillStyle = baseColor.replace('%a', alpha);
      ctx.fill();
      // glow
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 2.5, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r * 2.5);
      const c = CONFIG.colors.signal[this.colorIdx];
      grad.addColorStop(0, c + '22');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }

  class Signal {
    constructor(edge) {
      this.edge = edge;
      this.t = 0;
      this.speed = CONFIG.signalSpeed * (0.5 + Math.random());
      this.colorIdx = Math.floor(Math.random() * CONFIG.colors.signal.length);
      this.size = 2 + Math.random() * 2;
    }
    update() { this.t += this.speed; return this.t >= 1; }
    draw() {
      const [a, b] = this.edge;
      const x = a.x + (b.x - a.x) * this.t;
      const y = a.y + (b.y - a.y) * this.t;
      const color = CONFIG.colors.signal[this.colorIdx];
      ctx.beginPath();
      ctx.arc(x, y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      // trail
      for (let i = 1; i <= 5; i++) {
        const tt = Math.max(0, this.t - i * 0.015);
        const tx = a.x + (b.x - a.x) * tt;
        const ty = a.y + (b.y - a.y) * tt;
        ctx.beginPath();
        ctx.arc(tx, ty, this.size * (1 - i * 0.18), 0, Math.PI * 2);
        ctx.fillStyle = color + Math.floor((1 - i * 0.18) * 80).toString(16).padStart(2, '0');
        ctx.fill();
      }
    }
  }

  function resize() {
    W = canvas.width  = canvas.offsetWidth  = window.innerWidth;
    H = canvas.height = canvas.offsetHeight = window.innerHeight;
    buildEdges();
  }

  function buildEdges() {
    edges = [];
    for (let i = 0; i < nodes.length; i++) {
      let cnt = 0;
      for (let j = i + 1; j < nodes.length; j++) {
        if (cnt >= CONFIG.maxConnections) break;
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        if (Math.sqrt(dx*dx + dy*dy) < CONFIG.connectionDist) {
          edges.push([nodes[i], nodes[j]]);
          cnt++;
        }
      }
    }
  }

  function init() {
    nodes = Array.from({ length: CONFIG.nodeCount }, () => new Node());
    buildEdges();
    signals = [];
    for (let i = 0; i < CONFIG.signalCount; i++) {
      if (edges.length) {
        const s = new Signal(edges[Math.floor(Math.random() * edges.length)]);
        s.t = Math.random();
        signals.push(s);
      }
    }
  }

  function drawEdges() {
    for (const [a, b] of edges) {
      const dx = a.x - b.x, dy = a.y - b.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const alpha = Math.max(0, 1 - dist / CONFIG.connectionDist);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = `rgba(0,212,255,${(alpha * 0.12).toFixed(3)})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  function frame() {
    if (!enabled) { animId = requestAnimationFrame(frame); return; }
    ctx.clearRect(0, 0, W, H);

    // Update nodes
    for (const n of nodes) n.update();

    // Rebuild edges occasionally
    if (Math.random() < 0.01) buildEdges();

    drawEdges();
    for (const n of nodes) n.draw();

    // Update signals
    signals = signals.filter(s => {
      if (s.update()) {
        // respawn
        if (edges.length) {
          const ns = new Signal(edges[Math.floor(Math.random() * edges.length)]);
          signals.push(ns);
        }
        return false;
      }
      s.draw();
      return true;
    });

    // Spawn signal periodically
    if (Math.random() < 0.02 && signals.length < CONFIG.signalCount + 10 && edges.length) {
      signals.push(new Signal(edges[Math.floor(Math.random() * edges.length)]));
    }

    animId = requestAnimationFrame(frame);
  }

  window.toggleParticles = function() {
    enabled = !enabled;
    if (enabled) { ctx.clearRect(0, 0, W, H); }
  };

  window.setParticlesEnabled = function(v) { enabled = v; };

  window.addEventListener('resize', resize);
  resize();
  init();
  frame();
})();
