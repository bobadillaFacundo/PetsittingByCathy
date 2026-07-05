import os
import re

directory = r"f:\guarderiaCanina\frontend\src"

for root, _, files in os.walk(directory):
    for file in files:
        if file.endswith((".jsx", ".js")):
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                
            new_content = re.sub(r"['\"]http://localhost:8000(.*?)['\"]", r"`http://${window.location.hostname}:8000\1`", content)
            new_content = new_content.replace("`http://localhost:8000", "`http://${window.location.hostname}:8000")
            
            if new_content != content:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"Updated {filepath}")
