"""Build the application as a validated MuWeb module and an offline preview."""

import argparse
import json
from pathlib import Path
import tempfile

from muweb import build_artifact, module_bridge_source, write_artifact

ROOT: Path = Path(__file__).resolve().parent.parent
SCRIPTS: tuple[str, ...] = ('js/core.js', 'js/vendor/muweave-typography.js', 'js/app.js')
RUNTIME_TAG: str = '<script defer src="https://cdn.jsdelivr.net/npm/@mathjax/mathjax-modern-font@4.1.3/tex-mml-svg-mathjax-modern.js"></script>'
CSP: str = (
    "default-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; "
    "form-action 'none'; script-src 'unsafe-inline' 'unsafe-eval'; "
    "style-src 'unsafe-inline'; img-src data: blob:; font-src data:; "
    "frame-src 'none'; worker-src 'none'"
)


def compose_html(*, embedded: bool) -> str:
    """Compose the same application with its bridge or pinned offline runtime.

    Args:
        embedded: Whether the host supplies MathJax and learner persistence.
    """
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    manifest = json.loads((ROOT / 'muweb/muweave-module.json').read_text())
    version = manifest['version']
    if f"window.GG_APP_VERSION = '{version}'" not in html:
        raise ValueError('Entry and manifest versions differ')
    for relative in ('js/core.js', 'js/app.js'):
        if f"= '{version}'" not in (ROOT / relative).read_text():
            raise ValueError(f'Stale runtime asset: {relative}')
    replacements = {
        f'<link rel="stylesheet" href="css/styles.css?v={version}">':
            f'<style>{(ROOT / "css/styles.css").read_text()}</style>',
        f'<script src="js/mathjax-config.js?v={version}"></script>': '',
        RUNTIME_TAG: '',
        **{f'<script defer src="{path}?v={version}"></script>': '' for path in SCRIPTS},
    }
    for old, new in replacements.items():
        if html.count(old) != 1:
            raise ValueError(f'Expected one resource reference: {old}')
        html = html.replace(old, new, 1)
    if embedded:
        html = html.replace('<head>', f'<head>\n<meta http-equiv="Content-Security-Policy" content="{CSP}">', 1)
    else:
        from pyhtml.mathjax import _mathjax_runtime_markup

        html = html.replace('</head>', _mathjax_runtime_markup() + '\n</head>', 1)
    scripts = [(ROOT / path).read_text() for path in SCRIPTS]
    if embedded:
        scripts.insert(1, module_bridge_source())
    markup = '\n'.join('<script>' + source.replace('</script', '<\\/script') + '</script>' for source in scripts)
    before, after = html.rsplit('</body>', 1)
    return before + markup + '\n</body>' + after


def main() -> None:
    """Build and validate before writing either requested artifact."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--offline-page', type=Path)
    arguments = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='sine-formation-build-') as temporary:
        source = Path(temporary)
        (source / 'muweave-module.json').write_bytes((ROOT / 'muweb/muweave-module.json').read_bytes())
        (source / 'embed.html').write_text(compose_html(embedded=True), encoding='utf-8')
        artifact = build_artifact(source)
        write_artifact(artifact, arguments.output)
    if arguments.offline_page:
        arguments.offline_page.parent.mkdir(parents=True, exist_ok=True)
        arguments.offline_page.write_text(compose_html(embedded=False), encoding='utf-8')
    print(f'Validated {arguments.output}: {artifact.content_digest}')


if __name__ == '__main__':
    main()
