# Changelog

## Unreleased

- Add a dedicated image delivery specification and reusable desktop/mobile artwork templates with an AI task brief.
- Add paired-theme validation for images, posters, recorded artwork metadata, subject regions and declared text zones across sampled widths and motion positions.
- Include template validation in the standard checks and prevent poster-like layer IDs from bypassing image canvas checks.

## 1.2.0 - 2026-10-23

- Add opt-in contained subject layers and normalized placement, independent of background overscan.
- Recompose the mobile showcase to preserve all three heads, move its title to the upper safe area and scale height proportionally.
- Keep loaded layers at rest in static and reduced-motion modes instead of switching to a differently scaled poster.
- Fix container measurement under ancestor transforms and cancel parallax when a second touch starts, including outside the banner.
- Preserve preview modes across input changes and responsive remounts; restore browser back/forward cache pages without destroying their layers.
- Resolve directory index URLs in the local development server.
- Add subject-safe-region regression checks across 21 viewport widths and both displacement extremes; update the asset and integration contracts.

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
