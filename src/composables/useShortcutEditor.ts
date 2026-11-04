/** 快捷方式编辑态与弹层状态，主页与快捷方式卡片共享。 */
import { nextTick, ref } from "vue";
import { useShortcuts } from "@/composables/useShortcuts";
import type { Shortcut } from "@/types";
import type { ShortcutDraft } from "@/utils/shortcut";

export function useShortcutEditor() {
  const {
    shortcuts,
    addShortcut,
    updateShortcut,
    removeShortcut,
    moveShortcutTo,
  } = useShortcuts();

  const isEditing = ref(false);
  const shortcutDialogOpen = ref(false);
  const editingShortcut = ref<Shortcut | null>(null);

  function openCreateDialog(): void {
    editingShortcut.value = null;
    shortcutDialogOpen.value = true;
  }

  function openEditDialog(shortcut: Shortcut): void {
    editingShortcut.value = shortcut;
    shortcutDialogOpen.value = true;
  }

  function closeShortcutDialog(): void {
    shortcutDialogOpen.value = false;
  }

  function submitShortcut(draft: ShortcutDraft): void {
    const current = editingShortcut.value;

    if (current) {
      if (updateShortcut(current.id, draft)) shortcutDialogOpen.value = false;
      return;
    }

    const created = addShortcut(draft, 0);
    if (!created) return;

    shortcutDialogOpen.value = false;
    void nextTick(() => scrollShortcutIntoView(created.id));
  }

  function scrollShortcutIntoView(id: string): void {
    const card = [
      ...document.querySelectorAll<HTMLElement>("[data-shortcut-id]"),
    ].find((element) => element.dataset.shortcutId === id);
    card?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "end",
    });
  }

  function removeShortcutFromDialog(id: string): void {
    removeShortcut(id);
    shortcutDialogOpen.value = false;
  }

  function toggleEditing(): void {
    isEditing.value = !isEditing.value;
  }

  return {
    shortcuts,
    moveShortcutTo,
    isEditing,
    shortcutDialogOpen,
    editingShortcut,
    openCreateDialog,
    openEditDialog,
    closeShortcutDialog,
    submitShortcut,
    removeShortcutFromDialog,
    toggleEditing,
  };
}
