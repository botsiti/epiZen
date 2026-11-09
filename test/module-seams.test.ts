import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

const root = resolve('src');
function sources(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? sources(join(folder, entry.name)) : /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [join(folder, entry.name)] : []);
}
const files = sources(root), known = new Set(files);
function imports(file: string) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  return source.statements.flatMap((node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return [];
    const clause = node.importClause;
    if (clause?.isTypeOnly || clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.every((item) => item.isTypeOnly)) return [];
    const name = node.moduleSpecifier.text;
    const target = name.startsWith('.') ? [resolve(dirname(file), name) + '.ts', resolve(dirname(file), name) + '.tsx', resolve(dirname(file), name, 'index.ts')].find((path) => known.has(path)) : undefined;
    return [{ name, target }];
  });
}
it('keeps domain rules independent of feature rendering and native invocation', () => {
  const violations: string[] = [];
  for (const file of files.filter((path) => path.startsWith(join(root, 'lib') + '/'))) {
    const name = relative(root, file);
    for (const entry of imports(file)) {
      if (entry.target?.startsWith(join(root, 'components') + '/') || entry.name.startsWith('@tauri') && name !== 'lib/api.ts' || /^(react|react-dom)$/.test(entry.name) && name !== 'lib/useToday.ts') violations.push(`${name} imports ${entry.name}`);
    }
  }
  expect(violations).toEqual([]);
});
it('keeps the assistant implementation behind its public workspace and artwork interfaces', () => {
  const folder = join(root, 'components/assistant') + '/', publicFiles = ['AssistantWorkspace.tsx', 'Spike.tsx'];
  const violations = files.filter((file) => !file.startsWith(folder)).flatMap((file) => imports(file).filter(({ target }) => target?.startsWith(folder) && !publicFiles.some((name) => target === folder + name)).map(({ target }) => `${relative(root, file)} imports ${relative(root, target!)}`));
  expect(violations).toEqual([]);
});
it('does not introduce runtime import cycles in shared domain modules', () => {
  const domain = files.filter((file) => file.startsWith(join(root, 'lib') + '/')), members = new Set(domain);
  const visited = new Set<string>(), active: string[] = [], cycles: string[] = [];
  const visit = (file: string) => {
    const index = active.indexOf(file);
    if (index >= 0) { cycles.push([...active.slice(index), file].map((path) => relative(root, path)).join(' → ')); return; }
    if (visited.has(file)) return;
    active.push(file);
    for (const { target } of imports(file)) if (target && members.has(target)) visit(target);
    active.pop(); visited.add(file);
  };
  domain.forEach(visit);
  expect(cycles).toEqual([]);
});
