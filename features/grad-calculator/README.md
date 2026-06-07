# GR Commit V4

Grad Calculator is an isolated sibling feature to the existing Calculator.

- `domain/gradDomain.js`: pure level generation, lot distribution, weighted averages, and P/L math.
- `presentation/gradCalculatorModule.js`: isolated three-tab GR UI, boundary-grid chart dragging, live-position staleness protection, ownership, section controls, and section preflight/Send behavior.
- `grad-calculator.css`: Grad-only styling.

Binance ownership is proven only by Grad client-order IDs beginning with `GRAD_`. Orders without that ownership marker are treated as external/manual and are never imported or modified by Grad Calculator.
