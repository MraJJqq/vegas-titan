# VEGAS TITAN — Independent Trading Visualization

V1 is a self-contained rebuild of the three core visualization systems. It does not load code, assets, or runtime services from another Octopus deployment.

## Architecture
- `assets/js/core/`: immutable instrument universe and Bitget market-data transport/cache.
- `assets/js/scroll/`: single-owner vertical scroll engine, touch/wheel/inertia and visibility lifecycle.
- `assets/js/cards/`: card DOM/rendering and composition root; owns selection and formal-signal presentation.
- `assets/js/kline/`: Bitget candle/history loading, chart instances, viewport memory, gestures and signal-driven rotation.
- `assets/js/signals/`: read-only formal-signal adapter and bottom ticker presentation.

## Runtime rules
- Bitget is the only market-data exchange source.
- Instrument order is a visual contract: 27 instruments.
- Card selection is the only bridge from the card system to the K-line controller.
- K-line data access is isolated from chart rendering.
- Scroll, card and K-line systems each own their lifecycle and cleanup.
- Hidden tabs suspend polling and animation work; off-screen card decoration is paused.
- The visual system remains CSS-driven; optimization must not reduce card or chart presentation.

The formal-signal JSON remains a read-only V9 feed. V1 does not modify the V9 signal system.
