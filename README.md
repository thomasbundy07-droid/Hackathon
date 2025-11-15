# Co₂nscious

Chrome extension that quantifies the environmental impact of LLM conversations on OpenAI Chat and Claude.

## Features

- **Emissions Tracking**: Measures energy, water, and carbon emissions for every LLM response
- **UI**: Displays emissions in a minimalist UI in the top-right corner
- **Relatable Equivalents**: Shows impact as car miles driven and phone charge percentage
- **Live Metrics**: Tracks latency, tokens, and tokens/second alongside environmental data

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

1. [claude.ai](https://claude.ai)
2. Send a message to the LLM
3. Watch the Co₂nscious widget appear in the top-right corner with emissions data
4. Click the extension icon to view detailed metrics in the popup

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

- https://claude.ai/*
- https://*.anthropic.com/*

## Limitations

- **Limited Sited** Currently is only working on claude, hopefully will be expanded to many social medias and other AI platforms.
- **Emission tracking** All emission tracking is an estimate. Exact values are pretty much impossible to get at the moment.

- **Heuristic-based**: Uses DOM observation and simple text heuristics (not perfect)
- **Approximate token counts**: Uses 4 chars/token ratio by default (not exact)


## How Metrics Are Calculated

**Emissions** are calculated using the Jegham et al. (2025) methodology based on:
- Inference time (latency + generation time)
- GPU/CPU power draw
- Model-specific hardware specifications
- Data center PUE and regional carbon intensity

**Equivalents** help quantify impact:
- **Car miles**: CO₂ (grams) / 400
- **Phone charge**: (Energy Wh / 14.8) × 100%

## Future Improvements

- [ ] Support for more LLM providers (Gemini, Mistral, etc.) and social medias
- [ ] Historical analytics and trends

## License

Provided as-is for educational and testing purposes.

