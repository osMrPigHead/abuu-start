import { describe, expect, it, vi } from "vitest";
import type { Todo } from "@/types";
import { STORAGE_KEYS } from "@/utils/storage";
import type { TodoDraft } from "@/utils/todo";

async function loadTodos(stored?: unknown) {
  window.localStorage.clear();
  if (stored !== undefined) {
    window.localStorage.setItem(STORAGE_KEYS.todos, JSON.stringify(stored));
  }
  vi.resetModules();
  return import("@/composables/useTodos");
}

function draft(overrides: Partial<TodoDraft> = {}): TodoDraft {
  return {
    title: "写作业",
    dueAt: "2026-03-02T08:00",
    note: "",
    priority: "medium",
    repeat: "none",
    ...overrides,
  };
}

function stored(overrides: Partial<Todo> = {}): Todo {
  return {
    id: "a",
    title: "写作业",
    dueAt: "2026-03-02T08:00",
    note: "",
    priority: "medium",
    repeat: "none",
    done: false,
    completedAt: null,
    createdAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("useTodos hydration", () => {
  it("空存储返回空列表", async () => {
    const { useTodos } = await loadTodos();
    expect(useTodos().todos.value).toEqual([]);
  });

  it("过滤非法条目并去重 id", async () => {
    const { useTodos } = await loadTodos([
      stored({ id: "a" }),
      stored({ id: "a", title: "重复 id" }),
      { title: "" },
      stored({
        id: "b",
        priority: "urgent" as Todo["priority"],
        repeat: "monthly" as Todo["repeat"],
      }),
    ]);

    const { todos } = useTodos();
    expect(todos.value.map((todo) => todo.id)).toEqual(["a", "b"]);
    expect(todos.value[1]?.priority).toBe("medium");
    expect(todos.value[1]?.repeat).toBe("none");
  });

  it("重复任务缺少截止时间时降级为不重复", async () => {
    const { useTodos } = await loadTodos([
      stored({ id: "a", dueAt: null, repeat: "daily" }),
    ]);
    expect(useTodos().todos.value[0]?.repeat).toBe("none");
  });
});

describe("useTodos mutations", () => {
  it("addTodo 合法时新增并持久化", async () => {
    const { useTodos } = await loadTodos();
    const { addTodo, todos } = useTodos();

    const created = addTodo(draft({ title: "  新待办  " }));
    expect(created).not.toBeNull();
    expect(created?.title).toBe("新待办");
    expect(todos.value).toHaveLength(1);
    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEYS.todos) ?? "[]"),
    ).toHaveLength(1);
  });

  it("addTodo 非法草稿返回 null 且不写入", async () => {
    const { useTodos } = await loadTodos();
    const { addTodo, todos } = useTodos();
    expect(addTodo(draft({ title: " " }))).toBeNull();
    expect(todos.value).toHaveLength(0);
  });

  it("updateTodo 更新存在条目，拒绝不存在或非法草稿", async () => {
    const { useTodos } = await loadTodos([stored({ id: "a" })]);
    const { updateTodo, todos } = useTodos();

    expect(updateTodo("a", draft({ title: "更新后" }))).toBe(true);
    expect(todos.value[0]?.title).toBe("更新后");
    expect(updateTodo("missing", draft())).toBe(false);
    expect(updateTodo("a", draft({ title: " " }))).toBe(false);
  });

  it("removeTodo 删除存在条目，忽略不存在 id", async () => {
    const { useTodos } = await loadTodos([stored({ id: "a" })]);
    const { removeTodo, todos } = useTodos();

    removeTodo("missing");
    expect(todos.value).toHaveLength(1);
    removeTodo("a");
    expect(todos.value).toHaveLength(0);
  });

  it("toggleTodo 在完成与取消完成之间切换", async () => {
    const { useTodos } = await loadTodos([stored({ id: "a" })]);
    const { toggleTodo, todos } = useTodos();

    toggleTodo("a");
    expect(todos.value[0]?.done).toBe(true);
    expect(todos.value[0]?.completedAt).not.toBeNull();

    toggleTodo("a");
    expect(todos.value[0]?.done).toBe(false);
    expect(todos.value[0]?.completedAt).toBeNull();
  });

  it("重复待办完成后生成未来最近一条", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 2, 9, 0));
    const { useTodos } = await loadTodos([
      stored({ id: "a", dueAt: "2026-03-01T08:00", repeat: "daily" }),
    ]);
    const { toggleTodo, todos } = useTodos();

    toggleTodo("a");
    expect(todos.value).toHaveLength(2);
    const completed = todos.value.find((todo) => todo.done);
    const next = todos.value.find((todo) => !todo.done);
    expect(completed?.id).toBe("a");
    expect(next?.dueAt).toBe("2026-03-03T08:00");
    expect(next?.id).not.toBe("a");
  });
});

describe("useTodos sorting", () => {
  it("输出按未完成、截止时间排序", async () => {
    const { useTodos } = await loadTodos([
      stored({ id: "done", done: true }),
      stored({ id: "later", dueAt: "2026-03-03T08:00" }),
      stored({ id: "none", dueAt: null }),
      stored({ id: "soon", dueAt: "2026-03-02T08:00" }),
    ]);
    expect(useTodos().todos.value.map((todo) => todo.id)).toEqual([
      "soon",
      "later",
      "none",
      "done",
    ]);
  });
});
