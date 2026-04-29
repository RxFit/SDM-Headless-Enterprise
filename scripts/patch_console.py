import os
import glob
import re

server_dir = r"C:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\SDM-Headless-Enterprise\server"
logger_file = os.path.join(server_dir, "lib", "logger.ts")

for filepath in glob.glob(os.path.join(server_dir, "**", "*.ts"), recursive=True):
    if filepath == logger_file:
        continue
        
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
        
    if "console." not in content:
        continue
        
    # Replace console calls
    new_content = content.replace("console.log", "logger.info")
    new_content = new_content.replace("console.error", "logger.error")
    new_content = new_content.replace("console.warn", "logger.warn")
    
    # Calculate relative path to logger
    dir_path = os.path.dirname(filepath)
    rel_levels = os.path.relpath(server_dir, dir_path).count("..")
    
    if os.path.dirname(filepath) == server_dir:
        import_path = "./lib/logger"
    elif os.path.dirname(filepath) == os.path.join(server_dir, "lib"):
        import_path = "./logger"
    else:
        # e.g. server/routes/tasks.ts -> ../lib/logger
        levels = dir_path.replace(server_dir, "").strip(os.sep).count(os.sep) + 1
        import_path = "../" * levels + "lib/logger"
        
    # Add import if missing
    if "import { logger }" not in new_content:
        import_stmt = f'import {{ logger }} from "{import_path.replace(chr(92), "/")}";\n'
        
        # Find last import
        lines = new_content.split('\n')
        last_import = -1
        for i, line in enumerate(lines):
            if line.startswith("import "):
                last_import = i
                
        if last_import != -1:
            lines.insert(last_import + 1, import_stmt)
        else:
            lines.insert(0, import_stmt)
            
        new_content = '\n'.join(lines)
        
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(new_content)
    print(f"Patched: {filepath}")

print("T02 Console.log patching complete.")
