import os

files_to_update = [
    r"C:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\SDM-Headless-Enterprise\server\index.ts",
    r"C:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\SDM-Headless-Enterprise\server\lib\autoTaskRules.ts",
    r"C:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\SDM-Headless-Enterprise\server\lib\sheetSync.ts",
    r"C:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\SDM-Headless-Enterprise\server\routes\agents.ts",
    r"C:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\SDM-Headless-Enterprise\server\routes\edges.ts",
    r"C:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\SDM-Headless-Enterprise\server\routes\health.ts",
    r"C:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\SDM-Headless-Enterprise\server\routes\history.ts",
    r"C:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\SDM-Headless-Enterprise\server\routes\nodes.ts",
    r"C:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\SDM-Headless-Enterprise\server\routes\tasks.ts"
]

for file_path in files_to_update:
    if not os.path.exists(file_path): continue
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    content = content.replace("import type { JsonDb } from '../lib/jsonDb.js';", "import type { IDatabase } from '../lib/db.js';")
    content = content.replace("import type { JsonDb } from './jsonDb.js';", "import type { IDatabase } from './db.js';")
    content = content.replace("import { JsonDb } from './lib/jsonDb.js';", "import { DatabaseFacade, IDatabase } from './lib/db.js';")
    content = content.replace("db: JsonDb", "db: IDatabase")
    content = content.replace("private db: JsonDb", "private db: IDatabase")
    content = content.replace("new JsonDb", "new DatabaseFacade")
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

print('Updated imports to IDatabase')
