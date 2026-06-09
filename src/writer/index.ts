import * as fs from 'fs';
import * as path from 'path';
import { GeneratedFile } from '../types';

export function writeFiles(repoRoot: string, files: GeneratedFile[], dryRun: boolean): void {
  if (dryRun) {
    console.log('\nDry run — files that would be written:');
    for (const file of files) {
      console.log(`  ${file.path}`);
    }
    return;
  }

  for (const file of files) {
    const fullPath = path.join(repoRoot, file.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content, 'utf8');

    // Make shell scripts executable
    if (file.path.endsWith('.sh')) {
      fs.chmodSync(fullPath, 0o755);
    }
  }
}

export function checkE2eExists(repoRoot: string, force: boolean): void {
  const e2eDir = path.join(repoRoot, 'e2e');
  if (fs.existsSync(e2eDir) && !force) {
    throw new Error(
      'e2e/ directory already exists. Use --force to overwrite, or delete e2e/ manually before running.'
    );
  }
}
