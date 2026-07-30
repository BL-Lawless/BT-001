# Headless logger runners

Copy `.env.example` to `.env` and replace every required placeholder. `BT001_MACHINE_ID`
must uniquely identify this deployment; the runners deliberately provide no generated or default ID.

Install and run the SSSC pipeline:

```powershell
npm.cmd install
npm.cmd run headless:sssc
```

The SSSC process synchronizes its clock with Binance Futures, seeds all SSSC timeframes over REST,
opens the combined kline stream, calculates diagnostics, and writes the latest snapshot every 30 seconds.

Run the scalper signal-detection pipeline:

```powershell
npm.cmd run headless:scalper
```

It seeds the four scalp timeframes, consumes Binance kline streams, runs the extracted cross/bounce
detector and cascade calculation, and writes qualified detections only to `scalp_v1_signals` and
`scalp_v2_signals`. It has no account, position, order, trade, or operational logging capability.

Run one independent health check:

```powershell
npm.cmd run headless:monitor
```

The monitor reads the latest machine-scoped SSSC snapshots, detects missing/stale or frozen calculated
payloads, and checks `sssc-logger` and `scalp-signal-logger` with `systemctl is-active`. It prints alerts
and exits with status 1 when unhealthy. It records one unresolved incident per check within the configured
six-hour de-duplication window. Schedule this one-shot command every minute with the provided systemd
timer or an external scheduler. Set `MONITOR_CHECK_SYSTEMD=false` outside the VM.
