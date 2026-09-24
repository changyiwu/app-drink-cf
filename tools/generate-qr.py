"""Generate the homepage QR SVG with a solid white background."""

from io import BytesIO
from pathlib import Path
import re
import sys

import qrcode
from qrcode.image.svg import SvgPathImage


url = sys.argv[1] if len(sys.argv) > 1 else "https://drink-ordering-cf.changyiwu.workers.dev/"
if not url.startswith("https://"):
    raise SystemExit("Expected an HTTPS URL")

qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=2)
qr.add_data(url)
qr.make(fit=True)
output = BytesIO()
qr.make_image(image_factory=SvgPathImage).save(output)
svg = output.getvalue().decode("utf-8")
match = re.search(r'viewBox="0 0 (\d+) (\d+)"', svg)
if match is None or match.group(1) != match.group(2):
    raise SystemExit("Unexpected QR SVG size")
size = int(match.group(1))
svg = re.sub(r'width="\d+mm"', f'width="{size * 10}"', svg, count=1)
svg = re.sub(r'height="\d+mm"', f'height="{size * 10}"', svg, count=1)
svg = re.sub(
    r"(<svg\b[^>]*>)",
    lambda match: match.group(1)
    + f'<title>作伙喝飲料 首頁 QR Code</title><rect width="{size}" height="{size}" fill="#ffffff"/>',
    svg,
    count=1,
)
target = Path(__file__).resolve().parents[1] / "public" / "images" / "qr_home.svg"
target.write_text(svg, encoding="utf-8")
print(f"Generated {target} for {url}")
