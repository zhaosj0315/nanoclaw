from PIL import Image, ImageDraw, ImageFont
import math

def create_gradient(draw, rect, color1, color2):
    x0, y0, x1, y1 = rect
    height = y1 - y0
    for i in range(height):
        r = int(color1[0] + (color2[0] - color1[0]) * i / height)
        g = int(color1[1] + (color2[1] - color1[1]) * i / height)
        b = int(color1[2] + (color2[2] - color1[2]) * i / height)
        draw.line([(x0, y0 + i), (x1, y0 + i)], fill=(r, g, b))

def create_super_steamer():
    # Canvas
    width, height = 800, 800
    img = Image.new('RGB', (width, height), '#1a1a1a') # Dark background for contrast
    draw = ImageDraw.Draw(img)

    center_x = width // 2
    base_y = 650
    tray_width = 400
    tray_height = 60
    stack_count = 8

    # Draw "Quantum Heating Base"
    draw.ellipse([center_x - 220, base_y - 20, center_x + 220, base_y + 60], fill='#ff4500', outline='#ff8c00', width=5)
    draw.rectangle([center_x - 200, base_y, center_x + 200, base_y + 80], fill='#2a2a2a', outline='#ff4500')
    
    # Draw Stack of Trays
    colors = [
        ((192, 192, 192), (100, 100, 100)), # Silver/Metal gradient
    ]

    for i in range(stack_count):
        y = base_y - (i * (tray_height - 10))
        
        # Tray Body (Cylinder-ish)
        # Gradient effect manually
        rect = [center_x - 200, y - tray_height, center_x + 200, y]
        # Draw main block
        draw.rectangle(rect, fill='silver')
        
        # Shading
        draw.line([center_x - 200, y - tray_height, center_x - 200, y], fill='gray', width=2)
        draw.line([center_x + 200, y - tray_height, center_x + 200, y], fill='gray', width=2)
        
        # Bands/Ridges
        draw.line([center_x - 200, y - tray_height/2, center_x + 200, y - tray_height/2], fill='darkgray', width=1)

        # Top Rim (Ellipse)
        draw.ellipse([center_x - 200, y - tray_height - 15, center_x + 200, y - tray_height + 15], fill='#d3d3d3', outline='gray', width=2)

    # OPTIMIZATIONS
    
    # 1. Turbo Steam Vents (Semi-transparent clouds)
    steam_layer = Image.new('RGBA', (width, height), (0,0,0,0))
    steam_draw = ImageDraw.Draw(steam_layer)
    
    for i in range(5):
        # Left Vents
        x = center_x - 250 - (i*20)
        y = base_y - (i*80)
        steam_draw.ellipse([x, y, x+100, y+100], fill=(200, 230, 255, 100))
        # Right Vents
        x = center_x + 150 + (i*20)
        steam_draw.ellipse([x, y, x+100, y+100], fill=(200, 230, 255, 100))

    img.paste(steam_layer, (0,0), steam_layer)

    # 2. Holographic HUD
    hud_layer = Image.new('RGBA', (width, height), (0,0,0,0))
    hud_draw = ImageDraw.Draw(hud_layer)
    
    # Lines connecting to trays
    hud_draw.line([center_x + 200, base_y - 200, center_x + 350, base_y - 300], fill='#00ff00', width=2)
    hud_draw.line([center_x + 350, base_y - 300, center_x + 450, base_y - 300], fill='#00ff00', width=2)
    
    # Text
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 30)
        title_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 50)
    except:
        font = ImageFont.load_default()
        title_font = ImageFont.load_default()

    hud_draw.text((center_x + 360, base_y - 340), "EFFICIENCY: 99.9%", font=font, fill='#00ff00')
    hud_draw.text((center_x + 360, base_y - 300), "TEMP: PERFECT", font=font, fill='#00ff00')

    # Title
    hud_draw.text((50, 50), "GEMINI OPTIMIZED: SUPER STEAMER", font=title_font, fill='cyan')
    
    img.paste(hud_layer, (0,0), hud_layer)

    # Save
    output_filename = "super_steamer_optimized.jpg"
    img.save(output_filename)
    print(f"Created {output_filename}")

if __name__ == "__main__":
    create_super_steamer()
