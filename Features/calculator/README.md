# Calculator Feature

This folder hosts the extracted calculator module from `main.js`.

## Architecture

- `domain`: pure calculations and value transforms.
- `application`: orchestration/use-case logic using domain contracts.
- `infrastructure`: browser/API/storage adapters.
- `presentation`: DOM, canvas, and interaction wiring.

## Current state

- Legacy calculator UI logic was moved to `presentation/calculatorModule.js` as a compatibility step.
- Incremental refactoring should move logic from `presentation` into `domain` and `application` modules.