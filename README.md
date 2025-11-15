# LLM Response Metrics Chrome Extension

A lightweight Chrome extension that measures LLM response metrics in real-time on OpenAI and Anthropic chat interfaces.

## Features

- **Latency Measurement**: Measures time from send to first assistant token appearance
- **Token Estimation**: Estimates output tokens using a configurable character-to-token ratio (default: 4 chars/token)
- **Duration Tracking**: Measures total time from first to last token
- **Tokens/Second**: Calculates streaming speed (tokens generated per second)
- **In-Page Overlay**: Shows live metrics in a floating overlay
- **Popup UI**: Configure settings and view metric history
- **Debug Mode**: Enable verbose logging for troubleshooting

## How It Works

1. The content script detects user send actions (Enter key or Send button click)
2. Uses MutationObserver to detect when assistant message nodes appear in the DOM
3. Tracks text growth in message nodes to measure streaming
4. After 1 second of inactivity (QUIET_MS), finalizes metrics and reports them
5. Displays metrics in a floating overlay and stores history in chrome storage

## Files

- **manifest.json** — Extension configuration (Manifest V3)
- **content.js** — Content script that runs on chat pages (detection + overlay)
- **service_worker.js** — Background worker that stores metrics
- **popup.html** / **popup.js** — Settings UI and metrics history
- **overlay.css** — Styling for in-page metrics overlay
- **README.md** — This file

## Installation

1. Open `chrome://extensions` in Google Chrome
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Navigate to and select this folder
5. The extension should now be loaded!

## Usage

1. Visit [chat.openai.com](https://chat.openai.com) or [claude.ai](https://claude.ai)
2. Send a message to the LLM
3. Watch for the metrics overlay in the bottom-right corner
4. Click the extension icon to view the popup with detailed metrics and settings

### Adjusting Token Ratio

If token counts seem off, adjust the "Token ratio" setting in the popup:
- **Lower values** (e.g., 3): More characters per token (token count appears higher)
- **Higher values** (e.g., 5): Fewer characters per token (token count appears lower)

### Debug Mode

Enable "Enable Debug Logging" in the popup, then open DevTools (Cmd+Option+J) to see:
- Send detection events
- Message node observations
- Text growth updates
- Final metric calculations

## Supported Sites

- ✅ https://chat.openai.com/*
- ✅ https://claude.ai/*
- ✅ https://*.anthropic.com/*

## Limitations

- **Heuristic-based**: Uses DOM observation and simple text heuristics (not perfect)
- **Approximate token counts**: Uses 4 chars/token ratio by default (not exact)
- **Provider-specific**: Works best with OpenAI Chat and Anthropic/Claude; may need tuning for other providers
- **Does not use official tokenizers**: For exact token counts, would need integration with tiktoken or similar

## How Metrics Are Calculated

```
Latency = Time when first assistant message text appears - Time when user pressed Send
Duration = Time when assistant stops responding (no text changes for 1 second) - Time first text appeared
Tokens = Length of response text / Token ratio (default 4)
Tokens/Second = Tokens / (Duration in seconds)
```

## Future Improvements

- [ ] Integrate official tokenizers (tiktoken, claude-tokenizer)
- [ ] Support for more LLM providers
- [ ] Metrics history UI with charts
- [ ] CSV/JSON export
- [ ] Per-provider optimized selectors
- [ ] Distinguishing between thinking blocks and actual responses
- [ ] More accurate latency (first character appearance vs first visible text)

## Troubleshooting

**Extension won't load**: Make sure you're loading from the correct directory with all files present (manifest.json, content.js, etc.)

**Metrics show "waiting..." forever**: 
- Check DevTools console (Cmd+Option+J) for errors
- Enable debug mode to see if message nodes are being detected
- The selectors for your provider might not match the current DOM structure

**Token counts seem wrong**:
- Adjust the token ratio in the popup settings
- Note that this is a heuristic approximation, not exact tokenization

## License

Provided as-is for educational and testing purposes.

