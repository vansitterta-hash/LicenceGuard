import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const nodeRequire = createRequire(import.meta.url);
export function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    file = resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    const require = (id) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith('.')) {
        const path = resolve(dirname(file), id);
        if (path in mocks) return mocks[path];
        return load(existsSync(path + '.ts') ? path + '.ts' : path + '.tsx');
      }
      return nodeRequire(id);
    };
    new Function('exports', 'require', 'module', source)(module.exports, require, module);
    return module.exports;
  }
  return load;
}
export function hookHarness() {
  let slots = [], cursor = 0, effects = [], rerender = true, tree, component, props, mounted = true;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, (next) => {
        const value = typeof next === 'function' ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; rerender = true; }
      }];
    },
    useRef(initial) { const i = cursor++; return (slots[i] ??= { current: initial }); },
    useMemo(make, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: make(), deps };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        const old = slots[i]; slots[i] = { deps, cleanup: old?.cleanup };
        effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  const harness = {
    react,
    mount(fn, input) { component = fn; props = input; },
    render() { if (!mounted) return; cursor = 0; rerender = false; tree = component(props); const work = effects; effects = []; work.forEach((fn) => fn()); },
    async settle() { for (let i = 0; i < 40; i++) { if (rerender && mounted) harness.render(); await new Promise(setImmediate); } return tree; },
    invalidate() { rerender = true; },
    unmount() { mounted = false; slots.forEach((slot) => slot.cleanup?.()); },
    get tree() { return tree; },
  };
  return harness;
}
export function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
export const nativeMock = new Proxy({ StyleSheet: { create: (s) => s }, Platform: { OS: 'web' } }, {
  get: (target, key) => target[key] ?? String(key),
});
