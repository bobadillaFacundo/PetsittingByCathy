import os
from PIL import Image

public_dir = r"f:\guarderiaCanina\frontend\public"
logo_path = os.path.join(public_dir, "logo.png")

if os.path.exists(logo_path):
    with Image.open(logo_path) as img:
        # Convert to RGBA to preserve transparency
        img = img.convert("RGBA")
        
        # Create 192x192
        img_192 = img.resize((192, 192), Image.Resampling.LANCZOS)
        img_192.save(os.path.join(public_dir, "pwa-192x192.png"))
        
        # Create 512x512
        img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
        img_512.save(os.path.join(public_dir, "pwa-512x512.png"))
        
    print("Icons successfully generated!")
else:
    print("logo.png not found!")
