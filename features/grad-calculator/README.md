# GR Commit V7

Grad Calculator is an isolated sibling feature to the existing Calculator.

- `domain/gradDomain.js`: pure level generation, lot distribution, weighted averages, and P/L math.
- `presentation/gradCalculatorModule.js`: isolated three-tab GR UI with replace-only Reads, loaded-order stability, price-action sorting/numbering, collision-aware labels, universal Master SL display, persistent ownership, and Calculator-style preflight.
- `grad-calculator.css`: Grad-only styling.

Binance ownership is proven only by section-specific client-order IDs beginning with `GR_ENTRY_`, `GR_PROT_`, or `GR_EXIT_`. Orders without those ownership markers are treated as external/manual and are never imported or modified by GR.

Master SL is treated separately as universal position protection and is not classified as a GR-owned PSL.
