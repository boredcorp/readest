import { readdir, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const rootDir = process.cwd();

const collectFiles = async (relativeDirectories, extensions) => {
  const files = [];

  const visit = async (directory) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && extensions.has(extname(entry.name))) {
        files.push(path);
      }
    }
  };

  for (const relativeDirectory of relativeDirectories) {
    await visit(resolve(rootDir, relativeDirectory));
  }

  return files;
};

const countMatches = async (files, pattern) => {
  let count = 0;
  for (const file of files) {
    const contents = await readFile(file, 'utf8');
    count += contents.match(pattern)?.length ?? 0;
  }
  return count;
};

const countSyntaxOutsideLiterals = (contents, syntax) => {
  let count = 0;
  const states = [{ mode: 'code', templateBraceDepth: null }];

  for (let index = 0; index < contents.length; index += 1) {
    const current = contents[index];
    const next = contents[index + 1];
    const state = states.at(-1);

    if (state.mode === 'line-comment') {
      if (current === '\n') states.pop();
      continue;
    }
    if (state.mode === 'block-comment') {
      if (current === '*' && next === '/') {
        states.pop();
        index += 1;
      }
      continue;
    }
    if (state.mode === 'string') {
      if (current === '\\') {
        index += 1;
      } else if (current === state.quote) {
        states.pop();
      }
      continue;
    }
    if (state.mode === 'template') {
      if (current === '\\') {
        index += 1;
      } else if (current === '`') {
        states.pop();
      } else if (current === '$' && next === '{') {
        states.push({ mode: 'code', templateBraceDepth: 1 });
        index += 1;
      }
      continue;
    }

    if (current === '/' && next === '/') {
      states.push({ mode: 'line-comment' });
      index += 1;
      continue;
    }
    if (current === '/' && next === '*') {
      states.push({ mode: 'block-comment' });
      index += 1;
      continue;
    }
    if (current === "'" || current === '"') {
      states.push({ mode: 'string', quote: current });
      continue;
    }
    if (current === '`') {
      states.push({ mode: 'template' });
      continue;
    }
    if (state.templateBraceDepth !== null) {
      if (current === '{') {
        state.templateBraceDepth += 1;
      } else if (current === '}') {
        state.templateBraceDepth -= 1;
        if (state.templateBraceDepth === 0) states.pop();
        continue;
      }
    }
    if (syntax.some((token) => contents.startsWith(token, index))) {
      count += 1;
    }
  }

  return count;
};

const countSyntaxMatches = async (files, syntax) => {
  let count = 0;
  for (const file of files) {
    const contents = await readFile(file, 'utf8');
    count += countSyntaxOutsideLiterals(contents, syntax);
  }
  return count;
};

const assertFilesFound = (files, label) => {
  if (files.length === 0) {
    throw new Error(`No ${label} files found. Run the required build or asset setup first.`);
  }
};

const checks = {
  async translations() {
    const files = await collectFiles(['public/locales'], new Set(['.json']));
    assertFilesFound(files, 'translation');
    const count = await countMatches(files, /__STRING_NOT_TRANSLATED__/g);
    return {
      count,
      passMessage: 'All strings translated.',
      failMessage: 'Untranslated strings found in public/locales.',
    };
  },
  async 'optional-chaining'() {
    const files = await collectFiles(
      ['.next/static/chunks', 'out/_next/static/chunks'],
      new Set(['.js', '.mjs']),
    );
    assertFilesFound(files, 'built JavaScript');
    const count = await countSyntaxMatches(files, ['?.']);
    return {
      count,
      passMessage: 'No optional chaining found in web output.',
      failMessage: 'Optional chaining found in web output.',
    };
  },
  async 'lookbehind-regex'() {
    const files = await collectFiles(
      ['.next/static/chunks', 'out/_next/static/chunks'],
      new Set(['.js', '.mjs']),
    );
    assertFilesFound(files, 'built JavaScript');
    const count = await countSyntaxMatches(files, ['(?<=', '(?<!']);
    return {
      count,
      passMessage: 'No lookbehind regular expressions found in web output.',
      failMessage: 'Lookbehind regular expressions found in web output.',
    };
  },
};

const checkName = process.argv[2];
const check = checks[checkName];

if (!check) {
  console.error(`Unknown web-output check: ${checkName ?? '(missing)'}`);
  process.exit(2);
}

const result = await check();
if (result.count > 0) {
  console.error(`${result.failMessage} Matches: ${result.count}.`);
  process.exit(1);
}

console.log(result.passMessage);
