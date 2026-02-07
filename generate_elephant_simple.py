from PIL import Image, ImageDraw

def create_elephant():
    # Create a canvas
    width, height = 800, 600
    image = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(image)

    # Colors
    gray = (169, 169, 169)
    dark_gray = (105, 105, 105)

    # Body
    draw.ellipse([200, 200, 600, 500], fill=gray, outline=dark_gray)

    # Head
    draw.ellipse([150, 150, 350, 350], fill=gray, outline=dark_gray)

    # Ears
    draw.ellipse([100, 150, 250, 300], fill=gray, outline=dark_gray)
    draw.ellipse([250, 150, 400, 300], fill=gray, outline=dark_gray)

    # Legs
    draw.rectangle([250, 450, 300, 550], fill=gray, outline=dark_gray)
    draw.rectangle([350, 450, 400, 550], fill=gray, outline=dark_gray)
    draw.rectangle([450, 450, 500, 550], fill=gray, outline=dark_gray)
    draw.rectangle([550, 450, 600, 550], fill=gray, outline=dark_gray)

    # Trunk
    draw.polygon([(150, 300), (100, 400), (130, 410), (170, 320)], fill=gray, outline=dark_gray)

    # Eye
    draw.ellipse([200, 220, 220, 240], fill='black')

    # Save
    image.save('generated_elephant.jpg')

if __name__ == "__main__":
    create_elephant()
    print("generated_elephant.jpg created")
