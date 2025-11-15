// content.js
// Heuristic content script to observe chat pages (OpenAI, Anthropic/Claude) and
// measure: latency (time to first assistant token), duration, output token count,
// and tokens-per-second. Sends metrics to the background and shows a small overlay.

(function () {
  const TOKEN_RATIO_DEFAULT = 4; // approx chars per token (heuristic)
  const QUIET_MS = 1000; // consider stream finished after this many ms with no changes

  let tokenRatio = TOKEN_RATIO_DEFAULT;
  let debug = false;

  function debugLog(...args) {
    if (debug) console.debug('LLM-metrics-debug:', ...args);
  }

  function estimateTokens(text) {
    if (!text) return 0;
    // basic heuristic: ~4 chars per token
    return Math.max(1, Math.round(text.length / tokenRatio));
  }

  function sendMetrics(metrics) {
    try {
      chrome.runtime.sendMessage({ type: 'metrics', payload: metrics });
    } catch (e) {
      // when not available (e.g., local testing) fall back to console
      console.log('metrics', metrics);
    }
  }

  // Small floating overlay in the page to show last metrics
  function ensureOverlay() {
    if (document.getElementById('llm-metrics-overlay')) return;
    const o = document.createElement('div');
    o.id = 'llm-metrics-overlay';
    o.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483647;
      background: #ffffff;
      color: #374151;
      padding: 16px 18px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      width: 220px;
      line-height: 1.6;
      text-align: left;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      border: 1px solid #e0e7ff;
    `;
    o.innerHTML = `
      <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #1f2937;">Co<sub style="font-size: 10px;">2</sub>conscious</div>
      <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; font-size: 12px;">
        <span style="text-align: right; color: #6b7280;">Energy:</span>
        <span id="energy-val" style="text-align: left;">—</span>
        <span style="text-align: right; color: #6b7280;">Water:</span>
        <span id="water-val" style="text-align: left;">—</span>
        <span style="text-align: right; color: #6b7280;">Carbon:</span>
        <span id="carbon-val" style="text-align: left;">—</span>
      </div>
    `;
    document.documentElement.appendChild(o);
  }

  function updateOverlay(text) {
    ensureOverlay();
    const o = document.getElementById('llm-metrics-overlay');
    if (o) {
      const energyVal = o.querySelector('#energy-val');
      const waterVal = o.querySelector('#water-val');
      const carbonVal = o.querySelector('#carbon-val');
      if (energyVal && waterVal && carbonVal) {
        energyVal.innerText = text.energy || '—';
        waterVal.innerText = text.water || '—';
        carbonVal.innerText = text.carbon || '—';
      }
    }
  }

  // Get model config for emissions calculation
  function getModelConfigForProvider(provider) {
    const configs = {
      'openai': { name: 'gpt-4o', p_gpu_kw: 10.20, p_non_gpu_kw: 1.02, u_gpu: 0.065, u_non_gpu: 0.0625, pue: 1.12, wue_site: 0.30, wue_source: 3.142, cif: 0.3528 },
      'anthropic': { name: 'claude-3.7-sonnet', p_gpu_kw: 10.20, p_non_gpu_kw: 1.02, u_gpu: 0.065, u_non_gpu: 0.0625, pue: 1.14, wue_site: 0.18, wue_source: 3.142, cif: 0.385 }
    };
    return configs[provider] || configs.anthropic;
  }

  // Calculate emissions inline
  function calculateEmissionsQuick(outputTokens, tps, latencyMs, provider) {
    if (!outputTokens || !tps) return null;
    
    const config = getModelConfigForProvider(provider);
    const latencySec = Math.max(0, latencyMs / 1000);
    const generationTimeSec = outputTokens / tps;
    const totalTimeSec = latencySec + generationTimeSec;
    const inferenceTimeHours = totalTimeSec / 3600;
    
    const gpuPower = config.p_gpu_kw * config.u_gpu;
    const nonGpuPower = config.p_non_gpu_kw * config.u_non_gpu;
    const powerDrawKw = gpuPower + nonGpuPower;
    
    const energyKwh = inferenceTimeHours * powerDrawKw * config.pue;
    const energyWh = energyKwh * 1000;
    
    const itEnergyKwh = energyKwh / config.pue;
    const waterOnSiteLiters = itEnergyKwh * config.wue_site;
    const waterSourceLiters = energyKwh * config.wue_source;
    const waterTotalLiters = waterOnSiteLiters + waterSourceLiters;
    const waterMl = waterTotalLiters * 1000;
    
    const carbonKg = energyKwh * config.cif;
    const carbonGrams = carbonKg * 1000;
    
    return {
      energyWh: energyWh.toFixed(2),
      waterMl: waterMl.toFixed(1),
      carbonGrams: carbonGrams.toFixed(2),
      googleSearches: Math.round(energyWh / 0.30),
      phoneChargePercent: ((energyWh / 5) * 100).toFixed(1)
    };
  }

  // Heuristic: detect when user sends a message by listening for Enter (no shift) in inputs
  // and clicks on buttons that look like Send. This won't catch every UI, but is a good start.
  let lastSend = null;

  function recordUserSend(text) {
    lastSend = {
      text: text,
      time: Date.now()
    };
    console.log('[LLM-metrics] user send recorded:', text.slice(0, 50));
    console.log('[LLM-metrics] === CHECKING DOM FOR MESSAGE NODES ===');
    
    // Immediately check what nodes exist
    const allSelectors = [
      'div[data-testid="message-container"]',
      'div[data-testid="message"]',
      'div[class*="message-content"]',
      'div[role="article"]',
      'article',
      'div[class*="message"]',
      'div[class*="response"]',
      '[data-testid]'
    ];
    
    allSelectors.forEach((sel) => {
      try {
        const nodes = document.querySelectorAll(sel);
        if (nodes.length > 0) {
          console.log(`[LLM-metrics] Selector "${sel}": found ${nodes.length} nodes`);
          nodes.forEach((node, idx) => {
            if (idx < 3) { // Log first 3 matches
              const text = (node.textContent || '').trim().slice(0, 100);
              const attrs = Array.from(node.attributes).map(a => `${a.name}="${a.value}"`).join(', ');
              console.log(`  [${idx}] tag: ${node.tagName}, attrs: ${attrs}, text: "${text}..."`);
            }
          });
        }
      } catch (e) {
        // selector error, skip
      }
    });
    
    console.log('[LLM-metrics] === END DOM CHECK ===');
    debugLog('user send recorded:', text.slice(0, 50));
    updateOverlay('LLM metrics: waiting for response...');
  }

  function tryGetTextFromInput(el) {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value || '';
    return el.innerText || el.textContent || '';
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const target = e.target;
      const text = tryGetTextFromInput(target);
      if (text && text.trim().length) {
        debugLog('Enter key pressed in input, scheduling recordUserSend');
        // give the page a tick to process the send action
        setTimeout(() => recordUserSend(text.trim()), 50);
      }
    }
  }, true);

  // Also watch for send button clicks
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const label = (btn.innerText || btn.getAttribute('aria-label') || '').toLowerCase();
    // Heuristic: if button label suggests "send", look for nearby input
    if (/send|submit|enter/.test(label)) {
      const input = document.querySelector('textarea, [contenteditable="true"], input[type="text"]');
      const text = tryGetTextFromInput(input);
      if (text && text.trim().length) {
        debugLog('Send button clicked, scheduling recordUserSend');
        setTimeout(() => recordUserSend(text.trim()), 50);
      }
    }
  }, true);

  // We'll rely on observing assistant message nodes.
  // recordUserSend only records the send time and text so detected nodes can be associated
  // with the send to compute latency. This avoids emitting partial metrics too early.

  function guessProvider() {
    const host = location.hostname || '';
    if (host.includes('openai')) return 'openai';
    if (host.includes('claude') || host.includes('anthropic')) return 'anthropic';
    return host;
  }

  // Listen for settings from popup (e.g., token ratio)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'setTokenRatio') {
      tokenRatio = Number(msg.ratio) || TOKEN_RATIO_DEFAULT;
      sendResponse({ ok: true });
    }
    if (msg && msg.type === 'setDebug') {
      debug = !!msg.debug;
      sendResponse({ ok: true });
    }
  });

  // initialise overlay
  ensureOverlay();

  // Provide a simple console hint
  console.info('[LLM-metrics] content script loaded');

  // load saved config (tokenRatio, debug) from storage
  try {
    chrome.storage.local.get({ tokenRatio: TOKEN_RATIO_DEFAULT, debug: false }, (res) => {
      tokenRatio = res.tokenRatio || TOKEN_RATIO_DEFAULT;
      debug = !!res.debug;
      debugLog('loaded config', { tokenRatio, debug });
    });
  } catch (e) {
    debugLog('storage read failed', e);
  }

  // Add a debug helper to the window object for manual inspection
  window.__llmMetricsDebug = {
    getNodes: function() {
      console.log('=== Checking for message nodes ===');
      const provider = guessProvider();
      const selectors = providerSelectors[provider] || providerSelectors.anthropic;
      
      selectors.forEach((sel) => {
        const nodes = document.querySelectorAll(sel);
        console.log(`Selector "${sel}": found ${nodes.length} nodes`);
        nodes.forEach((node, idx) => {
          const text = (node.textContent || '').trim();
          console.log(`  [${idx}] text length: ${text.length}, preview: "${text.slice(0, 80)}..."`);
        });
      });
    },
    toggle: function(enable) {
      debug = enable;
      chrome.storage.local.set({ debug: enable });
      console.log('Debug mode:', enable);
    },
    getState: function() {
      console.log('nodeMetrics size:', nodeMetrics.size);
      console.log('lastSend:', lastSend);
    }
  };

  // --- Provider-specific detection of assistant message nodes ---
  const providerSelectors = {
    openai: [
      'div[data-testid="message"]',
      'div[class*="message"]',
      'div[role="listitem"]'
    ],
    anthropic: [
      'div[data-testid="message-container"]',
      'div[data-testid="message"]',
      'div[class*="message-content"]',
      'div[role="article"]',
      'article',
      'div[class*="message"]',  // very broad fallback
      'div[class*="response"]',  // response-specific
      'div > div > div'  // catch deeply nested divs (last resort)
    ]
  };

  // Track observed message nodes: node -> { firstTextTime, lastText, lastLength, timer, reported }
  const nodeMetrics = new Map();

  function makeNodeObserver(nodeSelector) {
    return new MutationObserver((mutations) => {
      // Find all message-like nodes matching the selector
      const nodes = document.querySelectorAll(nodeSelector);

      nodes.forEach((node) => {
        // Skip if we've already started tracking this node
        if (nodeMetrics.has(node)) return;

        const text = (node.textContent || '').trim();

        // Skip nodes with very little text
        if (text.length < 3) return;

        // Skip if the text matches the user's input (heuristic to skip input echo)
        if (lastSend && text === lastSend.text) {
          debugLog('skipping node that matches user input');
          return;
        }

        // This looks like a new assistant message. Start tracking it.
        const now = Date.now();
        const firstTextTime = now;
        const latency = lastSend ? Math.max(0, firstTextTime - lastSend.time) : null;

        nodeMetrics.set(node, {
          firstTextTime,
          lastText: text,
          lastLength: text.length,
          timer: null,
          reported: false,
          latency
        });

        console.log('[LLM-metrics] new message node observed, latency:', latency, 'ms, text length:', text.length);
        debugLog('new message node observed', { latency, textLen: text.length });
      });

      // Check for text changes in existing nodes
      nodes.forEach((node) => {
        const state = nodeMetrics.get(node);
        if (!state || state.reported) return;

        const text = (node.textContent || '').trim();
        const newLength = text.length;

        if (newLength > state.lastLength) {
          // Text is growing; update and restart the quiet timer
          state.lastText = text;
          state.lastLength = newLength;

          console.log('[LLM-metrics] message text growing, length:', newLength, ', delta:', newLength - state.lastLength);
          debugLog('message text growing', { newLength });

          // Clear and restart the quiet timer
          if (state.timer) clearTimeout(state.timer);

          state.timer = setTimeout(() => {
            if (state.reported) return;
            state.reported = true;

            // Compute metrics for this message
            const now = Date.now();
            const duration = now - state.firstTextTime;
            const tokens = estimateTokens(state.lastText);
            const tps = duration > 0 ? tokens / (duration / 1000) : null;

            const metrics = {
              provider: guessProvider(),
              sendTextSnippet: lastSend ? lastSend.text.slice(0, 300) : null,
              outputTextSnippet: state.lastText.slice(0, 300),
              estimatedTokenCount: tokens,
              latencyMs: state.latency,
              durationMs: duration,
              tokensPerSecond: tps,
              timestamp: Date.now()
            };

            console.log('[LLM-metrics] metrics finalized:', metrics);
            debugLog('metrics finalized:', metrics);
            
            // Calculate and display emissions in the overlay
            const provider = guessProvider();
            const emissions = calculateEmissionsQuick(tokens, tps, state.latency || 0, provider);
            if (emissions) {
              updateOverlay({
                energy: `${emissions.energyWh} Wh`,
                water: `${emissions.waterMl} mL`,
                carbon: `${emissions.carbonGrams} g`
              });
            } else {
              updateOverlay({
                energy: '—',
                water: '—',
                carbon: '—'
              });
            }
            sendMetrics(metrics);

            // Clean up this node from tracking
            nodeMetrics.delete(node);
          }, QUIET_MS);
        }
      });
    });
  }

  // Try each provider's selectors
  function observeProviderMessages() {
    const provider = guessProvider();
    const selectors = providerSelectors[provider] || providerSelectors.anthropic;

    console.log('[LLM-metrics] detected provider:', provider);
    console.log('[LLM-metrics] setting up observers for selectors:', selectors);

    selectors.forEach((sel) => {
      try {
        const observer = makeNodeObserver(sel);
        observer.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true,
          characterData: true
        });
        console.log('[LLM-metrics] observer started for selector:', sel);
        debugLog('observer started for selector:', sel);
      } catch (e) {
        console.error('[LLM-metrics] observer setup failed for selector:', sel, e);
        debugLog('observer setup failed for selector:', sel, e);
      }
    });
  }

  // Kick off observation
  observeProviderMessages();
})();
