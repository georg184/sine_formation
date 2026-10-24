# Sine formation

Audience: developers and teachers using the sine-function animation.

The application links a rotating point on the unit circle to the progressively
drawn graph of `y = sin(x)`. Orange marks the travelled arc and the horizontal
graph coordinate, blue the unit radius, and green the two identical signed
heights and the sine curve. The two diagrams share their vertical scale and
zero line. Horizontal graph coordinates use their own labelled scale.

The canonical public applet is [MuWeave Item 459](https://georg184.github.io/items/459/).
Its implementation lives here; the item repository publishes the generated,
self-contained PyHTML artifact. The source `index.html` is also directly usable
with its pinned MathJax CDN runtime. No second implementation or service worker
is maintained.

Start/Pause and reset control the animation. Angular speed ranges from 5 to
120 degrees per second, initially 30. Changing it integrates the old speed to
the change instant before continuing at the new speed. The arc-length slider
and exact-angle buttons pause the animation. It ends at `4π`; starting at the
end begins again at zero. During the second revolution, the completed circle
is pale orange and the remaining arc is labelled `x − 2π`.

The module ID is `sine_formation`, its sole/default activity is `sine`, and its
learner state has integer schema 1: `{schema: 1, x, speed}`. The curve is derived
from `x`. Restored work opens paused; running state, layout, and host typography
are presentation state. A direct standalone preview starts afresh. Compact
and full views share the application and differ only in their heading. The
MuWeb bridge is included unchanged from the installed package. MathJax is
supplied through `muweave-mathjax-4-svg-v1`; module bytes carry no private copy.

Run with Node.js and the existing Python environment containing MuWeb/PyHTML:

```sh
node scripts/check-core.js
node --check js/app.js
python scripts/build-muweb.py /tmp/sine_formation.muweb --offline-page /tmp/sine-formation.html
python -m muweb validate /tmp/sine_formation.muweb
```

The producer checks asset-version coherence and makes a deterministic archive.
The offline page uses exactly the same application scripts with the pinned
local PyHTML MathJax runtime. After real-browser and PyHTML integration checks,
install the verified artifact with:

```sh
python -m muweb install /tmp/sine_formation.muweb --interactive-dir /path/to/muweave_library/interactive
```

For the real-host integration test, build a temporary MuWeave document with
`µblock.applet(item=459, html="inline", numbered=False)` and the candidate
module directory supplied through `--interactive-dir`. Keep the ordinary
Typst document renderer: PyHTML supplies the declared MathJax profile only
inside the isolated module. No document-wide renderer override is needed.
The canonical item requests the compact view because the MuWeave frame supplies
the title. Run
`python scripts/check-browser.py /tmp/sine-preview.html` using an environment
with Playwright and Chrome. The test covers signed heights, cardinal angles,
speed changes, pause/resume/reset, the endpoint, keyboard controls, narrow
screens, offline loading, and snapshots through the actual MuWeb bridge.
`--url` selects an already published page for the same browser checks.

Publish Item 459 through the existing `items/scripts/export.py` and GitHub Pages
workflow. Its wrapper selects this canonical item; retain the same numeric URL.
Update the application token in entry HTML, asset URLs, core, UI, and manifest
together whenever runtime sources change. The typography vendor is copied
unchanged from `ggprojects/shared/muweave-typography.js`.
