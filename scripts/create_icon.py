from PIL import Image, ImageDraw

SIZE = 1024
img = Image.new("RGB", (SIZE, SIZE), "#0B1533")
draw = ImageDraw.Draw(img)

# Teal broadcast waves behind the bell.
for inset, width in [(112, 22), (176, 20), (240, 18)]:
    box = (inset, inset, SIZE - inset, SIZE - inset)
    draw.arc(box, start=206, end=334, fill="#25C7C9", width=width)
    draw.arc(box, start=26, end=154, fill="#25C7C9", width=width)

# Orange accent pulse.
draw.rounded_rectangle((154, 770, 870, 820), radius=25, fill="#FF9933")
draw.rounded_rectangle((270, 846, 754, 884), radius=19, fill="#FF9933")

# White bell body.
body = [(316, 420), (350, 352), (410, 298), (512, 278), (614, 298), (674, 352), (708, 420), (708, 572), (760, 650), (760, 700), (264, 700), (264, 650), (316, 572)]
draw.polygon(body, fill="#FFFFFF")
draw.ellipse((442, 690, 582, 790), fill="#FFFFFF")

# Teal notification signal mark.
draw.ellipse((650, 220, 730, 300), fill="#25C7C9")
draw.arc((704, 166, 870, 332), start=210, end=330, fill="#25C7C9", width=26)
draw.arc((738, 112, 966, 340), start=215, end=325, fill="#25C7C9", width=24)

for filename in ["icon.png", "splash-icon.png", "favicon.png", "android-icon-foreground.png"]:
    img.save(f"/home/ubuntu/notification-sender-app/assets/images/{filename}")
