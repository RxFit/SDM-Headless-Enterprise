import os
import re

def fix_pino():
    files = [
        r"C:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\SDM-Headless-Enterprise\server\routes\tasks.ts",
        r"C:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\SDM-Headless-Enterprise\server\routes\nodes.ts",
        r"C:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\SDM-Headless-Enterprise\server\routes\edges.ts",
        r"C:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\SDM-Headless-Enterprise\server\routes\agents.ts",
        r"C:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\SDM-Headless-Enterprise\server\schemas\validation.ts"
    ]
    for fp in files:
        if not os.path.exists(fp): continue
        with open(fp, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # fix logger.error('[msg]', err) to logger.error(err, '[msg]')
        content = re.sub(r"logger\.error\('([^']+)',\s*err\);", r"logger.error(err, '\1');", content)
        
        # Validation error fixes
        content = content.replace("(error as any).errors !== undefined", "error && (error as any).errors !== undefined")
        content = content.replace("errors: error.errors", "errors: (error as any).errors")
        content = content.replace("error.errors.map", "(error as any).errors.map")
        content = content.replace("(e =>", "((e: any) =>")
        
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(content)

fix_pino()
print("Fixed Pino logger args")
