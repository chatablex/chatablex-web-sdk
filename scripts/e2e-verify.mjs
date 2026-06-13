#!/usr/bin/env node
/**
 * Full automated E2E: dist smoke + host protocol + deploy layout.
 * Uses production SDK (dist/index.mjs) with inlined app tool handlers.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SDK_ROOT = path.resolve(__dirname, '..');

// ── inlined counter logic (same as counterStore.ts) ──
function counterAction(state, params) {
  const action = params.action || 'get';
  switch (action) {
    case 'get':
      return { state, result: { success: true, data: { action: 'get', current: state.count } } };
    case 'increment':
      return { state: { count: state.count + 1 }, result: { success: true, data: { current: state.count + 1 } } };
    case 'decrement':
      return { state: { count: state.count - 1 }, result: { success: true, data: { current: state.count - 1 } } };
    case 'reset':
      return { state: { count: 0 }, result: { success: true, data: { current: 0 } } };
    case 'set': {
      const v = Number(params.value);
      if (Number.isNaN(v)) return { state, result: { success: false, error: 'invalid value' } };
      return { state: { count: v }, result: { success: true, data: { current: v } } };
    }
    default:
      return { state, result: { success: false, error: `unknown: ${action}` } };
  }
}

// ── inlined todo logic (same as todoStore.ts) ──
function todoAction(todos, params) {
  const action = params.action || 'get';
  const snap = (list) => ({
    total: list.length,
    pending: list.filter((t) => !t.done).length,
    completed: list.filter((t) => t.done).length,
    todos: list.map((t) => ({ id: t.id, title: t.title, done: t.done })),
  });
  switch (action) {
    case 'get':
      return { todos, result: { success: true, data: { action: 'get', ...snap(todos) } } };
    case 'add': {
      const title = String(params.title || '').trim();
      if (!title) return { todos, result: { success: false, error: 'title required' } };
      const item = { id: `todo_${Date.now()}`, title, done: false };
      const next = [...todos, item];
      return { todos: next, result: { success: true, data: { action: 'add', ...snap(next) } } };
    }
    case 'toggle': {
      const id = params.id;
      if (!id) return { todos, result: { success: false, error: 'id required' } };
      const next = todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
      if (next.every((t, i) => t.done === todos[i].done)) {
        return { todos, result: { success: false, error: 'id not found' } };
      }
      return { todos: next, result: { success: true, data: { action: 'toggle', ...snap(next) } } };
    }
    default:
      return { todos, result: { success: false, error: `unknown: ${action}` } };
  }
}

function createMockHost() {
  const sent = [];
  const storage = new Map();
  global.window = global.window || {};
  window.ChatableXBridge = {
    postMessage(jsonStr) {
      const msg = JSON.parse(jsonStr);
      sent.push(msg);
      if (msg.method === 'tool.executeResult') return;
      if (!msg.id) return;
      queueMicrotask(() => {
        if (!window.ChatableXReceive) return;
        if (msg.method === 'storage.get') {
          window.ChatableXReceive(JSON.stringify({
            type: 'response', id: msg.id, success: true, data: storage.get(msg.params?.key) ?? null,
          }));
        } else if (msg.method === 'storage.set') {
          storage.set(msg.params?.key, msg.params?.value);
          window.ChatableXReceive(JSON.stringify({ type: 'response', id: msg.id, success: true }));
        } else if (msg.method === 'sdk_init') {
          window.ChatableXReceive(JSON.stringify({
            type: 'response', id: msg.id, success: true,
            data: { id: msg.params?.appId, name: msg.params?.appId, version: '1.0.0', description: '' },
          }));
        }
      });
    },
  };
  return {
    sent, storage,
    pushEvent(type, data) {
      window.ChatableXReceive(JSON.stringify({ type: 'event', eventType: type, data }));
    },
    findResult(rid) {
      return sent.find((m) => m.method === 'tool.executeResult' && m.params?._requestId === rid);
    },
  };
}

function waitFor(fn, ms = 3000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const poll = () => {
      try { const v = fn(); if (v) return resolve(v); } catch { /* */ }
      if (Date.now() - t0 > ms) return reject(new Error('timeout'));
      setTimeout(poll, 20);
    };
    poll();
  });
}

async function testCounter() {
  const host = createMockHost();
  const { ChatableX } = await import(pathToFileURL(path.join(SDK_ROOT, 'dist/index.mjs')).href);
  let state = { count: 0 };
  const sdk = await ChatableX.init({ appId: 'counter-app' });
  sdk.tool.onExecute(async (params) => {
    const { state: next, result } = counterAction(state, params);
    state = next;
    await sdk.storage.set('counter-app:count', next);
    return result;
  });

  host.pushEvent('toolExecution', { action: 'get', _requestId: 'c1', _toolName: 'counter_control' });
  const r1 = await waitFor(() => host.findResult('c1'));
  if (r1.params.data?.current !== 0) throw new Error('counter get@0');

  host.pushEvent('toolExecution', { action: 'increment', _requestId: 'c2', _toolName: 'counter_control' });
  const r2 = await waitFor(() => host.findResult('c2'));
  if (r2.params.data?.current !== 1) throw new Error('counter increment');

  host.pushEvent('toolExecution', { action: 'get', _requestId: 'c3', _toolName: 'counter_control' });
  const r3 = await waitFor(() => host.findResult('c3'));
  if (r3.params.data?.current !== 1) throw new Error('counter get@1');

  console.log('PASS:counter get→increment→get (production SDK dist)');
}

async function testTodo() {
  const host = createMockHost();
  const { ChatableX } = await import(pathToFileURL(path.join(SDK_ROOT, 'dist/index.mjs')).href);
  let todos = [];
  const sdk = await ChatableX.init({ appId: 'todo-app' });
  sdk.tool.onExecute(async (params) => {
    const { todos: next, result } = todoAction(todos, params);
    todos = next;
    await sdk.storage.set('todo-app:todos', next);
    return result;
  });

  host.pushEvent('toolExecution', { action: 'get', _requestId: 't1', _toolName: 'todo_control' });
  await waitFor(() => host.findResult('t1'));

  host.pushEvent('toolExecution', { action: 'add', title: '买牛奶', _requestId: 't2', _toolName: 'todo_control' });
  const r2 = await waitFor(() => host.findResult('t2'));
  if (r2.params.data?.total !== 1) throw new Error('todo add');

  host.pushEvent('toolExecution', { action: 'get', _requestId: 't3', _toolName: 'todo_control' });
  const r3 = await waitFor(() => host.findResult('t3'));
  if (r3.params.data?.pending !== 1) throw new Error('todo get after add');

  if (!host.storage.get('todo-app:todos')?.length) throw new Error('todo storage');

  console.log('PASS:todo get→add→get + storage (production SDK dist)');
}

function verifyDistBundles() {
  for (const app of ['counter-app', 'todo-app']) {
    const distDir = path.join(SDK_ROOT, 'examples', app, 'dist');
    const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
    const jsFiles = fs.readdirSync(path.join(distDir, 'assets')).filter((f) => f.endsWith('.js'));
    const js = fs.readFileSync(path.join(distDir, 'assets', jsFiles[0]), 'utf8');
    if (!html.includes('./assets/')) throw new Error(`${app}: bad index.html`);
    if (js.length < 1000) throw new Error(`${app}: bundle too small`);
    console.log(`PASS:dist ${app} bundle OK (${jsFiles[0]})`);
  }
}

function verifyDeployed(myToolsRoot) {
  for (const app of ['counter-app', 'todo-app']) {
    const dir = path.join(myToolsRoot, app);
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    if (pkg.chatablex?.webapp?.webui?.entry !== './dist/index.html') throw new Error(`${app}: entry`);
    if (!fs.existsSync(path.join(dir, 'dist', 'index.html'))) throw new Error(`${app}: no dist`);
    if (!pkg.chatablex?.tools?.[0]?.inputSchema?.properties?.action?.enum?.includes('get')) {
      throw new Error(`${app}: schema`);
    }
    console.log(`PASS:deployed ${app}`);
  }
}

async function main() {
  const myTools = path.join(process.env.HOME || '', '.ChatableX', 'my_tools');
  console.log('=== dist bundle ===');
  verifyDistBundles();
  console.log('=== host protocol (SDK dist/index.mjs) ===');
  await testCounter();
  await testTodo();
  console.log('=== deployed layout ===');
  verifyDeployed(myTools);
  console.log('ALL_E2E_PASSED');
}

main().catch((e) => { console.error('E2E_FAILED:', e.message); process.exit(1); });
