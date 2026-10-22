# Changelog

## 1.1.0 - 2026-10-22

- Add opt-in `interaction.touch: 'drag'` with direction arbitration, pointer ownership and native vertical scrolling.
- Allow programmatic progress on touch devices when touch motion is explicitly enabled; reduced motion still takes priority.
- Add visibility and touch-interaction events for host-controlled animation.
- Add a Frieren showcase with dedicated mobile layers, lightweight automatic preview and a standalone offline HTML.
- Add a README animation, online showcase deployment and touch regression coverage.

## 1.0.0 - 2026-10-22

- A standalone banner component, independent of website navigation and business logic.
- One source builds ESM, browser IIFE, CommonJS and TypeScript declarations.
- Shared-canvas overscan, container-relative pointer tracking and container resize observation.
- Entry-relative horizontal displacement and a 200 ms linear return.
- Original-size Bilibili split_layer v1 adapter with scale, translation, rotation, blur, opacity and bezier remapping.
- Poster fallback, bounded media loading, optional-layer degradation and lifecycle cleanup.
- Touch/reduced-motion behavior, mobile poster support and hidden-page video suspension.
- Pixel-decoding asset validation, integration documentation and automated regression checks.
