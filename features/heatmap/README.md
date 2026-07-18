# Liquidation heatmap prototype

The feature is split into browser modules with a manual-only provider boundary:

- `provider-config.module.js`: Actor identity, interval mapping, polling, timeout, and input construction.
- `provider-auth.module.js`: prototype-local credential save, clear, status, and connection test.
- `provider-adapter.module.js`: asynchronous Actor start, restrained polling, Actor-success checkpointing, and authenticated dataset retrieval/retry.
- `dataset.module.js`: bounded response-shape discovery, safe JSON-wrapper decoding, structural validation, and indexed-cell normalization.
- `state.module.js`: preferences, request generation, atomic publication, last-good cache, downstream recovery checkpoints, and sanitized diagnostics.
- `renderer.module.js`: clipped canvas cells, normalization palette, legend, and source label.
- `ui.module.js`: standard chart-overlay visibility toggle and the Heatmap Settings tab, including provider recovery controls.
- `index.js`: composition API used by the main chart.

## Prototype authentication

The Heatmap Settings Provider section accepts an Apify API key in a masked input. The value is stored locally only after **Save key**, the visible input is immediately cleared, and **Clear key** removes the stored record. The input is never pre-populated.

The credential is read only by `provider-auth.module.js` and `provider-adapter.module.js`. It is sent in the Authorization header, never in a request URL, DOM attribute, status message, or diagnostic object.

**Test connection** calls Apify's authenticated user endpoint and does not start an Actor.

## Provider workflow

The fixed prototype Actor is `api_merge/coinank-liquidation-heatmap`. UI durations are mapped centrally to its documented interval values. An explicit Refresh starts one asynchronous run, polls every four seconds for up to 120 seconds, checkpoints the successful run and `defaultDatasetId`, retrieves the dataset only after `SUCCEEDED`, validates outer response metadata plus nested `liqHeatMap`, and publishes one immutable normalized snapshot.

If retrieval or later local processing fails after Actor success, **Retry dataset retrieval** reuses the retained dataset ID. Cached raw payloads resume at parsing, and cached normalized data resumes at rendering; neither path starts another Actor.

Parser diagnostics expose only structural summaries: value types, key names, array lengths, inspected paths, JSON-decoding paths, and output-reference presence. Raw provider values, URLs, and matrix contents are not copied into diagnostics.

No provider request is made on startup, enable, duration change, Settings open, chart timeframe change, pan, zoom, or redraw.
