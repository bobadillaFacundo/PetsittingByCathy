import os

base_dir = 'src'
api_url = 'https://petsittingbycathy.onrender.com'
count = 0

for root, _, files in os.walk(base_dir):
    for f in files:
        if f.endswith('.js') or f.endswith('.jsx'):
            path = os.path.join(root, f)
            with open(path, 'r', encoding='utf-8') as file:
                content = file.read()
            
            # Reemplazar fetch('/api/ por fetch('https://petsittingbycathy.onrender.com/
            new_content = content.replace("fetch('/api/", f"fetch('{api_url}/")
            new_content = new_content.replace('fetch("/api/', f'fetch("{api_url}/')
            new_content = new_content.replace("fetch(`/api/", f"fetch(`{api_url}/")

            if new_content != content:
                with open(path, 'w', encoding='utf-8') as file:
                    file.write(new_content)
                count += 1
                print(f'Replaced in {path}')

print(f'Total files modified: {count}')
