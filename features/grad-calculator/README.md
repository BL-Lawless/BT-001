# Grad Calculator V1

Grad Calculator is an isolated sibling feature to the existing Calculator.

- `domain/gradDomain.js`: pure level generation, lot distribution, weighted averages, and P/L math.
- `presentation/gradCalculatorModule.js`: Grad-only UI, state, chart labels, ownership, Read, Clear, Show, and section Send behavior.
- `grad-calculator.css`: Grad-only styling.

Binance ownership is proven only by Grad client-order IDs beginning with `GRAD_`. Orders without that ownership marker are treated as external/manual and are never imported or modified by Grad Calculator.
