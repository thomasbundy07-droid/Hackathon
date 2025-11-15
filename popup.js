// popup.js

document.addEventListener('DOMContentLoaded', () => {
  const ratioInput = document.getElementById('ratio');
  const saveBtn = document.getElementById('save');
  const lastDiv = document.getElementById('last');
  const emissionsDiv = document.getElementById('emissions');
  const debugCheckbox = document.getElementById('debug');

  // Load saved settings
  chrome.storage.local.get({ tokenRatio: 4, debug: false, lastLlmMetric: null }, (result) => {
    ratioInput.value = result.tokenRatio || 4;
    debugCheckbox.checked = !!result.debug;
    if (result.lastLlmMetric) {
      displayMetric(result.lastLlmMetric);
    }
  });

  // Save button handler
  saveBtn.addEventListener('click', () => {
    const ratio = parseFloat(ratioInput.value) || 4;
    const debug = !!debugCheckbox.checked;
    chrome.storage.local.set({ tokenRatio: ratio, debug: debug }, () => {
      // Broadcast to all tabs
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          try {
            chrome.tabs.sendMessage(tab.id, { type: 'setTokenRatio', ratio: ratio });
            chrome.tabs.sendMessage(tab.id, { type: 'setDebug', debug: debug });
          } catch (e) {
            // Tab may not have content script
          }
        });
      });
    });
  });

  // Debug checkbox handler (immediate)
  debugCheckbox.addEventListener('change', () => {
    const debug = !!debugCheckbox.checked;
    chrome.storage.local.set({ debug: debug }, () => {
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          try {
            chrome.tabs.sendMessage(tab.id, { type: 'setDebug', debug: debug });
          } catch (e) {
            // Tab may not have content script
          }
        });
      });
    });
  });

  // Display a metric in the UI, including emissions
  function displayMetric(metric) {
    const lines = [
      `provider: ${metric.provider || 'unknown'}`,
      `tokens: ${metric.estimatedTokenCount || 0}`,
      `latency: ${metric.latencyMs !== null ? Math.round(metric.latencyMs) + 'ms' : 'n/a'}`,
      `duration: ${metric.durationMs ? Math.round(metric.durationMs) + 'ms' : 'n/a'}`,
      `t/s: ${metric.tokensPerSecond ? metric.tokensPerSecond.toFixed(1) : 'n/a'}`,
      `timestamp: ${new Date(metric.timestamp).toLocaleTimeString()}`
    ];
    lastDiv.innerText = lines.join('\n');

    // Calculate emissions
    if (typeof calculateEmissions === 'function' && typeof formatEmissionsForDisplay === 'function' && metric.estimatedTokenCount && metric.tokensPerSecond) {
      // Guess model name from provider
      let modelName = metric.provider;
      if (modelName === 'openai') modelName = 'gpt-4o';
      if (modelName === 'anthropic') modelName = 'claude-3.7-sonnet';
      
      const emissions = calculateEmissions({
        outputTokens: metric.estimatedTokenCount,
        tps: metric.tokensPerSecond,
        latencyMs: metric.latencyMs || 0,
        modelName
      });
      
      const display = formatEmissionsForDisplay(emissions);
      emissionsDiv.innerHTML = `
        <b>🌱 Emissions:</b><br>
        <span>Energy: ${display.energyDisplay}</span><br>
        <span>Water: ${display.waterDisplay}</span><br>
        <span>Carbon: ${display.carbonDisplay}</span><br>
        <span style="color:#2563eb;">${display.googleEquivalent}</span><br>
        <span style="color:#2563eb;">${display.phoneChargePercent}</span>
      `;
    } else {
      emissionsDiv.innerHTML = '';
    }
  }

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.lastLlmMetric && changes.lastLlmMetric.newValue) {
      displayMetric(changes.lastLlmMetric.newValue);
    }
  });
});
