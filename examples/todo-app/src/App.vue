<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ChatableXSDK } from 'chatablex-web-sdk';
import { initTodoBridge, isInsideChatableX, persistTodos } from './bridge';
import { applyTodoAction, buildSnapshot, type Todo } from './todoStore';

const todos = ref<Todo[]>([]);
const draft = ref('');
const hosted = ref(false);
const ready = ref(false);
const sdkRef = ref<ChatableXSDK | null>(null);

const snapshot = computed(() => buildSnapshot(todos.value));

async function persist(next: Todo[]) {
  todos.value = next;
  await persistTodos(sdkRef.value, next);
}

onMounted(async () => {
  hosted.value = isInsideChatableX();
  sdkRef.value = await initTodoBridge(() => todos.value, (t) => { todos.value = t; });
  ready.value = true;
});

function addFromUi() {
  const title = draft.value.trim();
  if (!title) return;
  const { todos: next } = applyTodoAction(todos.value, { action: 'add', title });
  persist(next);
  draft.value = '';
}

function toggleUi(id: string) {
  const { todos: next } = applyTodoAction(todos.value, { action: 'toggle', id });
  persist(next);
}

function removeUi(id: string) {
  const { todos: next } = applyTodoAction(todos.value, { action: 'delete', id });
  persist(next);
}

function clearDone() {
  const { todos: next } = applyTodoAction(todos.value, { action: 'clear_completed' });
  persist(next);
}
</script>

<template>
  <div class="page">
    <div class="card">
      <header class="header">
        <span class="badge">{{ hosted ? 'ChatableX' : '本地预览' }}</span>
        <h1>待办清单</h1>
        <p class="subtitle">先 <code>get</code> 查看任务，再 <code>add</code> / <code>toggle</code> — 多轮对话可靠</p>
      </header>

      <div v-if="ready" class="stats">
        <div class="stat">
          <span class="stat-num">{{ snapshot.total }}</span>
          <span class="stat-label">全部</span>
        </div>
        <div class="stat pending">
          <span class="stat-num">{{ snapshot.pending }}</span>
          <span class="stat-label">待办</span>
        </div>
        <div class="stat done">
          <span class="stat-num">{{ snapshot.completed }}</span>
          <span class="stat-label">已完成</span>
        </div>
      </div>

      <form class="add-row" @submit.prevent="addFromUi">
        <input
          v-model="draft"
          type="text"
          placeholder="添加新任务…"
          aria-label="新任务标题"
          maxlength="200"
        />
        <button type="submit" class="btn-add" :disabled="!draft.trim()">添加</button>
      </form>

      <ul v-if="todos.length" class="list">
        <li v-for="item in todos" :key="item.id" :class="{ done: item.done }">
          <label class="row">
            <input type="checkbox" :checked="item.done" @change="toggleUi(item.id)" />
            <span class="title">{{ item.title }}</span>
          </label>
          <button type="button" class="btn-remove" aria-label="删除" @click="removeUi(item.id)">×</button>
        </li>
      </ul>
      <p v-else class="empty">暂无任务。对话中说「添加待办：买牛奶」试试。</p>

      <footer class="footer">
        <button v-if="snapshot.completed > 0" type="button" class="btn-clear" @click="clearDone">
          清除已完成 ({{ snapshot.completed }})
        </button>
        <div class="hints">
          <p>对话示例：</p>
          <ul>
            <li>「查看当前待办」→ <code>todo_control(get)</code></li>
            <li>「添加：写文档」→ <code>todo_control(add, title=…)</code></li>
            <li>「完成 id 为 xxx 的任务」→ 先 get 再 toggle</li>
          </ul>
          <p v-if="hosted" class="storage-hint">数据保存在宿主 <code>sdk.storage</code>（SQLite，按工具隔离）</p>
        </div>
      </footer>
    </div>
  </div>
</template>
