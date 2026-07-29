# Ubuntu deployment

The recommended deployment uses a read-only GitHub SSH deploy key and native `systemd`.
A deploy key avoids storing a personal access token on a single-purpose VM. `systemd` is already
part of Ubuntu, adds no process-manager dependency, restarts failed processes, and starts them on boot.

Expected layout:

- service account: `btlogger`
- repository: `/opt/bt-001`
- untracked environment file: `/opt/bt-001/.env`
- units: `/etc/systemd/system/sssc-logger.service` and
  `/etc/systemd/system/scalp-signal-logger.service`

After cloning with the deploy key, install production dependencies with `npm ci --omit=dev`, copy
`.env.example` to `.env`, and replace all placeholders. The VM must receive a new permanent
`BT001_MACHINE_ID`; never copy a browser/laptop identifier.

Install and start the units:

```bash
sudo cp deploy/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sssc-logger scalp-signal-logger
systemctl status sssc-logger scalp-signal-logger
```

Reboot verification:

```bash
sudo reboot
# reconnect after boot
systemctl is-enabled sssc-logger scalp-signal-logger
systemctl is-active sssc-logger scalp-signal-logger
journalctl -u sssc-logger -u scalp-signal-logger --since boot --no-pager
```

Database verification must filter all five tables by the exact VM machine ID and a timestamp after
service startup. Rows are expected in `sssc_snapshots`, `scalp_v1_signals`, and
`scalp_v2_signals`. The same query window must return zero VM rows from `scalp_positions`,
`scalp_trades`, and `scalp_operational`.
