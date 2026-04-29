import os
import re

def fix_tasks_and_others():
    files = [
        r"C:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\SDM-Headless-Enterprise\server\routes\tasks.ts",
        r"C:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\SDM-Headless-Enterprise\server\routes\nodes.ts",
        r"C:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\SDM-Headless-Enterprise\server\routes\edges.ts",
        r"C:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\SDM-Headless-Enterprise\server\routes\agents.ts"
    ]
    for fp in files:
        if not os.path.exists(fp): continue
        with open(fp, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # fix req.params.id being typed as string[] randomly if TS thinks so in this context
        content = content.replace("req.params.id", "(req.params.id as string)")
        content = content.replace("(req.params.id as string) as string", "(req.params.id as string)") # prevent double cast
        
        # ensure logger.js import exists
        if "import { logger }" not in content:
            content = "import { logger } from '../lib/logger.js';\n" + content
        elif "import { logger } from '../lib/logger';" in content:
            content = content.replace("import { logger } from '../lib/logger';", "import { logger } from '../lib/logger.js';")
            
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(content)

def fix_validation():
    fp = r"C:\Users\danie\OneDrive\Documents\AI_AGENTS_ANTIGRAVITY_LOCAL\SDM-Headless-Enterprise\server\schemas\validation.ts"
    with open(fp, 'r', encoding='utf-8') as f:
        content = f.read()
    
    content = content.replace("import { logger } from '../lib/logger';", "import { logger } from '../lib/logger.js';")
    content = content.replace("z.record(z.any())", "z.record(z.string(), z.any())")
    content = content.replace("schema: z.AnyZodObject | z.ZodEffects<any>", "schema: z.ZodType<any, any, any>")
    
    # zod error typing
    content = content.replace("error instanceof z.ZodError", "(error as any).errors !== undefined")
    
    with open(fp, 'w', encoding='utf-8') as f:
        f.write(content)

fix_tasks_and_others()
fix_validation()
print("Fixed TS errors")
