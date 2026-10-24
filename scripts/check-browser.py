"""Exercise the actual SVG application offline, including an embedded MuWeb host."""

import argparse
import json
import math
from pathlib import Path

from playwright.sync_api import sync_playwright


def main() -> None:
    """Run visual and behavioral checks against a local HTML file or public URL."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', nargs='?', type=Path)
    parser.add_argument('--url')
    parser.add_argument('--output', type=Path, default=Path('/tmp/sine-formation-browser'))
    arguments = parser.parse_args()
    arguments.output.mkdir(parents=True, exist_ok=True)
    url = arguments.url or arguments.source.resolve().as_uri()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True)
        context = browser.new_context(viewport={'width': 1600, 'height': 1200}, offline=not bool(arguments.url))
        page = context.new_page()
        errors: list[str] = []
        requests: list[str] = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('request', lambda request: requests.append(request.url) if request.url.startswith(('http:', 'https:')) else None)
        page.clock.install()
        page.goto(url, wait_until='load')
        app = None
        for _ in range(150):
            for candidate in page.frames:
                if candidate.locator('#app').count():
                    app = candidate
                    break
            if app:
                break
            page.wait_for_timeout(100)
        assert app, 'Application frame missing'
        app.locator('#app[data-ready="true"]').wait_for(timeout=30000)
        context.set_offline(True)

        def click(selector: str) -> None:
            """Click in physical page coordinates, including the host's CSS zoom.

            Args:
                selector: Selector of a visible application control.
            """
            target = app.locator(selector)
            if app == page.main_frame:
                target.click()
                return
            frame_element = app.frame_element()
            inner = target.evaluate('node => node.getBoundingClientRect().toJSON()')
            outer = frame_element.evaluate('node => ({rect:node.getBoundingClientRect().toJSON(),width:node.clientWidth,height:node.clientHeight})')
            physical_y = outer['rect']['y'] + (inner['y'] + inner['height'] / 2) * outer['rect']['height'] / outer['height']
            if physical_y < 30 or physical_y > page.viewport_size['height'] - 30:
                page.evaluate('delta => window.scrollBy(0, delta)', physical_y - page.viewport_size['height'] / 2)
                outer = frame_element.evaluate('node => ({rect:node.getBoundingClientRect().toJSON(),width:node.clientWidth,height:node.clientHeight})')
            page.mouse.click(
                outer['rect']['x'] + (inner['x'] + inner['width'] / 2) * outer['rect']['width'] / outer['width'],
                outer['rect']['y'] + (inner['y'] + inner['height'] / 2) * outer['rect']['height'] / outer['height'],
            )

        def angle() -> float:
            """Read the common angular coordinate exposed by the rendered diagram."""
            return float(app.locator('#diagram').get_attribute('data-x'))

        def choose(value: float) -> None:
            """Select an arbitrary position through the real input event.

            Args:
                value: Arc length in radians inside the displayed interval.
            """
            app.locator('#position').evaluate('(node, value) => { node.value = value; node.dispatchEvent(new Event("input", {bubbles:true})); }', value)
            assert abs(angle() - value) < 1e-11

        def verify_height(value: float) -> None:
            """Check signed heights, both endpoints, and the progressive clip.

            Args:
                value: Arc length used as the independent expected angle.
            """
            geometry = app.locator('#diagram').evaluate('''node => {
                const attrs = id => Object.fromEntries(Array.from(node.querySelector('#' + id).attributes).map(a => [a.name,a.value]));
                return Object.fromEntries(['circle-y','graph-y','circle-point','graph-point','trace-clip','graph-x'].map(id => [id,attrs(id)]));
            }''')
            expected_y = 218 - 114 * math.sin(value)
            expected_x = 170 + 114 * math.cos(value)
            for name in ('circle-y', 'graph-y'):
                assert float(geometry[name]['y1']) == 218
                assert abs(float(geometry[name]['y2']) - expected_y) < 1e-9
            assert geometry['circle-y']['stroke'] == geometry['graph-y']['stroke']
            assert abs(float(geometry['circle-point']['cx']) - expected_x) < 1e-9
            assert abs(float(geometry['graph-point']['cx']) - (392 + 70 * value)) < 1e-9
            assert abs(float(geometry['graph-point']['cy']) - expected_y) < 1e-9
            assert abs(float(geometry['trace-clip']['width']) - 70 * value) <= .011
            assert abs(float(geometry['graph-x']['x2']) - (392 + 70 * value)) < 1e-9

        assert angle() == 0
        assert app.locator('#play').inner_text() == 'Start'
        verify_height(0)
        for multiple in (0.5, 1, 1.5, 2, 4):
            click(f'[data-angle="{multiple:g}"]')
            verify_height(multiple * math.pi)
        choose(4 * math.pi)
        verify_height(4 * math.pi)
        choose(3.5 * math.pi)
        verify_height(3.5 * math.pi)
        assert app.locator('#completed-circle').get_attribute('visibility') == 'visible'
        assert 'Restbogen' in app.locator('#lap-note').inner_text()
        choose(5 * math.pi / 3)
        page.screenshot(path=str(arguments.output / 'desktop.png'), full_page=True)

        click('#reset')
        click('#play')
        page.clock.run_for(1000)
        first = angle()
        assert .49 < first < .59, first
        app.locator('#speed').evaluate('node => { node.value=60; node.dispatchEvent(new Event("input", {bubbles:true})); }')
        changed = angle()
        assert abs(changed - first) < .08
        page.clock.run_for(1000)
        assert abs(angle() - changed - math.pi / 3) < .08
        click('#play')
        paused = angle()
        page.clock.run_for(1500)
        assert angle() == paused
        click('#play')
        page.clock.run_for(500)
        assert angle() > paused
        click('#play')
        choose(4 * math.pi - .01)
        click('#play')
        page.clock.run_for(1000)
        assert angle() == 4 * math.pi
        assert app.locator('#play').inner_text() == 'Start'
        click('#play')
        page.clock.run_for(100)
        assert 0 < angle() < .3
        click('#reset')
        assert angle() == 0
        assert app.locator('#speed').input_value() == '60'

        app.locator('#speed').focus()
        app.locator('#speed').press('ArrowRight')
        assert app.locator('#speed').input_value() == '65'
        app.locator('#position').focus()
        app.locator('#position').press('ArrowRight')
        assert angle() > 0
        choose(math.pi / 2)
        snapshot = app.evaluate('window.MuWeaveModuleBridge?.getState() ?? null')
        if app != page.main_frame:
            assert snapshot['schema'] == 1 and snapshot['speed'] == 65, snapshot
            assert abs(snapshot['x'] - math.pi / 2) < 1e-12, snapshot
            assert app.evaluate('window.MuWeaveModuleBridge.isInitialized()')
            page.locator('[data-applet-fullscreen]').click()
            page.wait_for_timeout(300)
            assert abs(angle() - math.pi / 2) < 1e-11
            assert page.locator('[data-applet-exit]').is_visible()
            page.locator('[data-applet-exit]').click()
            page.wait_for_timeout(300)
            assert abs(angle() - math.pi / 2) < 1e-11

        page.set_viewport_size({'width': 390, 'height': 844})
        page.wait_for_timeout(300)
        assert app.locator('#play').is_visible()
        assert app.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 2')
        scroll = app.locator('.plot-scroll')
        assert scroll.evaluate('node => node.scrollWidth > node.clientWidth')
        scroll.evaluate('node => { node.scrollLeft = node.scrollWidth; }')
        page.screenshot(path=str(arguments.output / 'phone.png'), full_page=True)
        page.set_viewport_size({'width': 1600, 'height': 1200})
        scroll.evaluate('node => { node.scrollLeft = 0; }')
        choose(5 * math.pi / 2)
        page.screenshot(path=str(arguments.output / 'second-turn.png'), full_page=True)
        assert not errors, errors
        if not arguments.url:
            assert not requests, requests
        assert app.locator('[data-mjx-error], mjx-merror').count() == 0
        print(json.dumps({'url': url, 'embedded': app != page.main_frame, 'errors': errors, 'snapshot': snapshot, 'network_requests': requests, 'checks': 'geometry, signed heights, cardinal angles, second turn, variable speed, pause/resume/reset, endpoint, keyboard, narrow viewport, offline'}, ensure_ascii=False))
        browser.close()


if __name__ == '__main__':
    main()
