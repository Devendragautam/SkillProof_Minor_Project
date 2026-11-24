"""Render diagram HTML files to PNG at 2x device scale (documented diagram pipeline)."""
import asyncio, pathlib, sys

BASE = pathlib.Path("/home/z/my-project/report-assets/diagrams")
JOBS = [
    ("fig31-architecture.html", "fig31-architecture.png"),
    ("fig32-backend-map.html", "fig32-backend-map.png"),
    ("fig33-sdlc.html", "fig33-sdlc.png"),
    ("fig34-usecase.html", "fig34-usecase.png"),
    ("fig35-er.html", "fig35-er.png"),
    ("fig41-authflow.html", "fig41-authflow.png"),
    ("fig42-sequence.html", "fig42-sequence.png"),
    ("fig43-journey.html", "fig43-journey.png"),
    ("fig46-workspace.html", "fig46-workspace.png"),
]

async def main():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 860, "height": 1200}, device_scale_factor=2)
        for src, out in JOBS:
            await page.goto(f"file://{BASE / src}")
            await page.wait_for_timeout(250)
            el = await page.query_selector("#shot")
            await el.screenshot(path=str(BASE / out))
            print("rendered", out)
        await browser.close()

asyncio.run(main())
