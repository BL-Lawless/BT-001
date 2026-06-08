# GR Commit V11

Grad Calculator is an isolated sibling feature to the existing Calculator.

- `domain/gradDomain.js`: pure level generation, lot distribution, weighted averages, and P/L math.
- `presentation/gradCalculatorModule.js`: isolated three-tab GR UI with direct Entry Flush, open-orders-only reads, levels SVG toolbar icon, no-offset chart labels, PSL-only Protection, persistent ownership, and Calculator-style preflight.
- `grad-calculator.css`: Grad-only styling.

Binance ownership is proven only by section-specific client-order IDs beginning with `GR_ENTRY_`, `GR_PROT_`, or `GR_EXIT_`. Orders without those ownership markers are treated as external/manual and are never imported or modified by GR.

GR Protection reads and manages only proven `GR_PROT_PSL_` partial-stop orders.
