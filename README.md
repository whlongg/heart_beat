# Heartbeat

A cinematic 3D particle heart built with vanilla JavaScript, Three.js, GSAP, and Simplex Noise.

## Preview locally

Serve the repository with a static HTTP server (opening `index.html` directly may fail due to model/CORS restrictions):

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. Drag to rotate the heart and scroll or pinch to zoom.

## Visual Refresh

- Glowing shader-based particle sprites with a rose/lavender palette
- Double-pulse heartbeat animation with accessible reduced-motion behavior
- Precomputed static noise and reusable typed array particle buffers
- Three adaptive performance profiles in `js/quality.js`
- Responsive cinematic background, high-DPI limits, pause on background tabs
- WebGL and remote-asset loading fallback

### Quality profiles

| Profile | Point samples | DPR cap |
| --- | ---: | ---: |
| desktop | 10,000 | 1.75 |
| mobile | 5,000 | 1.4 |
| low | 2,400 | 1.0 |

The page starts with a device-appropriate profile and can downgrade after sustained low frame rates. These are tuning defaults, not benchmark results.

## Asset note

The heart mesh is still requested from `https://assets.codepen.io/127738/heart_2.obj`, matching the original project. It must remain reachable for WebGL rendering. Self-host the model only after confirming permission to redistribute it.

## Validation checklist

1. Run with browser DevTools open and confirm no console errors.
2. Check desktop, 390px portrait and 360px portrait layouts.
3. Verify mouse drag, wheel zoom, touch drag, pinch, window resize.
4. Verify `prefers-reduced-motion`, missing WebGL, and model-load failure.
5. Profile frame time and memory on real midrange Android hardware before merging.
6. Confirm GitHub Pages and the existing `CNAME` still behave as intended.

This branch is for preview/review; merging into `main` is a separate action.
