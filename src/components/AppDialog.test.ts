import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import AppDialog from "@/components/AppDialog.vue";

function mountDialog() {
  return mount(AppDialog, {
    props: {
      open: true,
      titleId: "dialog-title",
    },
    slots: {
      header: "<h2 id='dialog-title'>标题</h2>",
      default: "<p>内容</p>",
      footer: "<button type='button'>确定</button>",
    },
  });
}

afterEach(() => {
  document.body.style.overflow = "";
});

describe("AppDialog", () => {
  it("Escape 发出 close", async () => {
    const wrapper = mountDialog();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("打开时锁定 body 滚动，关闭时恢复原值", async () => {
    document.body.style.overflow = "scroll";
    const wrapper = mountDialog();
    await wrapper.vm.$nextTick();

    expect(document.body.style.overflow).toBe("hidden");

    await wrapper.setProps({ open: false });
    expect(document.body.style.overflow).toBe("scroll");
    wrapper.unmount();
  });
});
