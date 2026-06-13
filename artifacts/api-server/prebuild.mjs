import { cp, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function copyWorkspaceDeps() {
  const workspaces = ['db', 'api-zod'];
  const targetBase = path.join(__dirname, 'node_modules', '@workspace');
  
  for (const ws of workspaces) {
    const source = path.join(__dirname, '..', '..', 'lib', ws);
    const target = path.join(targetBase, ws);
    
    try {
      await access(source);
      await mkdir(targetBase, { recursive: true });
      await cp(source, target, { recursive: true });
      console.log(`✅ Copied @workspace/${ws}`);
    } catch (err) {
      console.log(`⚠️ Could not copy @workspace/${ws}:`, err.message);
    }
  }
}

copyWorkspaceDeps();
