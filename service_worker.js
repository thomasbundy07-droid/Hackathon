// service_worker.js
// Background service worker for Chrome Extension Manifest V3.
// Receives metrics from content scripts and stores them.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'metrics' && msg.payload) {
    const metrics = msg.payload;

    // Store the metrics in local storage with history
    chrome.storage.local.get({ llmMetricsHistory: [] }, (result) => {
      const history = result.llmMetricsHistory || [];
      history.unshift(metrics);
      // Keep last 50 metrics
      if (history.length > 50) history.length = 50;

      chrome.storage.local.set({
        llmMetricsHistory: history,
        lastLlmMetric: metrics
      });
    });

    sendResponse({ ok: true });
  }
  return true;
});
