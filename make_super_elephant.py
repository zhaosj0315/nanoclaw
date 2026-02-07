from PIL import Image, ImageDraw, ImageFont
import os

source_img = "elephant.jpg"
output_img = "super_elephant.jpg"

if not os.path.exists(source_img):
    # Fallback if image doesn't exist, create a blank one
    img = Image.new('RGB', (800, 600), color = (73, 109, 137))
    d = ImageDraw.Draw(img)
    d.text((10,10), "Elephant not found, created placeholder", fill=(255,255,0))
else:
    img = Image.open(source_img)
    d = ImageDraw.Draw(img)

# Simple visual representation of "3 Heads, 6 Arms, Wings" via text/shapes
# Since we can't generate realistic AI images locally without a model, we annotate.

width, height = img.size
center_x = width // 2
center_y = height // 2

# "Wings" (Blue polygons)
d.polygon([(center_x-100, center_y-50), (center_x-300, center_y-150), (center_x-100, center_y+50)], fill=(135, 206, 235, 128), outline="blue")
d.polygon([(center_x+100, center_y-50), (center_x+300, center_y-150), (center_x+100, center_y+50)], fill=(135, 206, 235, 128), outline="blue")

# "Extra Heads" (Circles)
head_radius = 50
d.ellipse((center_x - 150 - head_radius, center_y - 200 - head_radius, center_x - 150 + head_radius, center_y - 200 + head_radius), outline="red", width=5)
d.ellipse((center_x + 150 - head_radius, center_y - 200 - head_radius, center_x + 150 + head_radius, center_y - 200 + head_radius), outline="red", width=5)

# "Extra Arms" (Lines)
for i in range(3):
    y_offset = i * 40
    d.line((center_x - 50, center_y + y_offset, center_x - 200, center_y + y_offset + 50), fill="green", width=10)
    d.line((center_x + 50, center_y + y_offset, center_x + 200, center_y + y_offset + 50), fill="green", width=10)

# Text Annotation
try:
    # Try to load a default font, otherwise default
    font = ImageFont.truetype("Arial", 40)
except:
    font = ImageFont.load_default()

text = "UPGRADE: 3 HEADS + 6 ARMS + WINGS"
text_bbox = d.textbbox((0, 0), text, font=font)
text_w = text_bbox[2] - text_bbox[0]
d.text(((width - text_w) / 2, height - 100), text, font=font, fill=(255, 255, 255), stroke_width=2, stroke_fill="black")

img.save(output_img)
print(f"Created {output_img}")
