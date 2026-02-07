from PIL import Image, ImageDraw, ImageFilter
import os

source_img = "elephant.jpg"
output_img = "super_elephant_v2.jpg"

if not os.path.exists(source_img):
    # Fallback
    img = Image.new('RGB', (800, 600), color = (100, 100, 100))
else:
    img = Image.open(source_img)

width, height = img.size
draw = ImageDraw.Draw(img)

# 1. Three Heads (Clone the central head area)
# Assume head is roughly top-center. 
head_box = (int(width*0.25), int(height*0.1), int(width*0.75), int(height*0.5))
try:
    head_region = img.crop(head_box)
    
    # Left Head (Rotated and pasted)
    # Mask for transparency if possible, otherwise rectangular paste
    # We use a simple paste for robustness in this environment
    left_head = head_region.rotate(15, expand=True)
    img.paste(left_head, (int(width*0.05), int(height*0.1)))
    
    # Right Head (Rotated and pasted)
    right_head = head_region.rotate(-15, expand=True)
    img.paste(right_head, (int(width*0.55), int(height*0.1))) # Shifted right
except Exception as e:
    print(f"Could not smart-clone heads: {e}")
    # Fallback to drawing circles
    draw.ellipse((width*0.1, height*0.1, width*0.4, height*0.4), fill=(150,150,150), outline="black")
    draw.ellipse((width*0.6, height*0.1, width*0.9, height*0.4), fill=(150,150,150), outline="black")

# 2. Six Arms (Draw thick conceptual limbs)
arm_color = (80, 80, 80) 
center_x = width // 2
body_y_start = int(height * 0.4)

for i in range(3):
    y_pos = body_y_start + (i * 80)
    
    # Left Arm
    draw.line((center_x - 100, y_pos, center_x - 300, y_pos - 50), fill=arm_color, width=30)
    
    # Right Arm
    draw.line((center_x + 100, y_pos, center_x + 300, y_pos - 50), fill=arm_color, width=30)

img.save(output_img)
print(f"Generated {output_img}")