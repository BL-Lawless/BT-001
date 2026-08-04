# Liquidation heatmap

The browser heatmap is a read-only consumer of the latest normalized `3D` snapshot in
`liquidation_heatmap_snapshots`. It never calls Apify or CoinAnk.

- `provider-adapter.module.js`: reads the newest `BTCUSDT` row through the shared Supabase service.
- `state.module.js`: publishes normalized cells, retains `event_at` as freshness, reads on app load,
  and checks for a newer row every 30 minutes.
- `dataset.module.js`: normalizes provider payloads for the VM writer and remains usable in-browser
  for rendering compatibility.
- `renderer.module.js`: draws normalized cells, legend, source, duration, and freshness.
- `ui.module.js`: owns display preferences and the read-only VM source/freshness status.

Apify credentials and Actor execution exist only in `headless/pull-liquidation-heatmap.js` on the VM.
