import { ConfirmDialog } from "@closet/ui";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

const mountDialog = (props: Record<string, unknown> = {}) =>
  mount(ConfirmDialog, {
    props: { open: true, title: "Удалить плагин?", message: "Действие необратимо", ...props },
    global: { stubs: { Teleport: true } },
  });

const buttons = (wrapper: ReturnType<typeof mountDialog>) => wrapper.findAll("button");

describe("ConfirmDialog", () => {
  it("ничего не рендерит при open = false", () => {
    const wrapper = mountDialog({ open: false });

    expect(wrapper.find(".modal").exists()).toBe(false);
  });

  it("показывает title, message и confirmLabel по умолчанию", () => {
    const wrapper = mountDialog();

    expect(wrapper.find("h2").text()).toBe("Удалить плагин?");
    expect(wrapper.find("p").text()).toBe("Действие необратимо");
    expect(buttons(wrapper)[1]?.text()).toBe("Удалить");
  });

  it("эмитит confirm по кнопке подтверждения и cancel по кнопке «Отмена»", async () => {
    const wrapper = mountDialog();
    const [cancel, confirm] = buttons(wrapper);

    await confirm?.trigger("click");
    await cancel?.trigger("click");

    expect(wrapper.emitted("confirm")).toHaveLength(1);
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });

  it("эмитит cancel по клику на фон, но не по клику внутри окна", async () => {
    const wrapper = mountDialog();

    await wrapper.find(".modal").trigger("click");
    expect(wrapper.emitted("cancel")).toBeUndefined();

    await wrapper.find(".modal-backdrop").trigger("click");
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });

  it("с confirmPhrase блокирует подтверждение до точного ввода фразы", async () => {
    const wrapper = mountDialog({ confirmPhrase: "my-plugin" });
    const confirm = buttons(wrapper)[1];
    const input = wrapper.find("input");

    expect((confirm?.element as HTMLButtonElement).disabled).toBe(true);

    await input.setValue("my-plug");
    expect((confirm?.element as HTMLButtonElement).disabled).toBe(true);
    await confirm?.trigger("click");
    expect(wrapper.emitted("confirm")).toBeUndefined();

    await input.setValue("my-plugin");
    // кнопку берём заново: happy-dom не всегда снимает disabled с уже найденного элемента
    await buttons(wrapper)[1]?.trigger("click");
    expect(wrapper.emitted("confirm")).toHaveLength(1);
  });

  it("Enter в поле фразы подтверждает только при совпадении", async () => {
    const wrapper = mountDialog({ confirmPhrase: "my-plugin" });
    const input = wrapper.find("input");

    await input.setValue("nope");
    await input.trigger("keydown.enter");
    expect(wrapper.emitted("confirm")).toBeUndefined();

    await input.setValue("my-plugin");
    await input.trigger("keydown.enter");
    expect(wrapper.emitted("confirm")).toHaveLength(1);
  });

  it("при busy блокирует обе кнопки, показывает спиннер и не эмитит confirm", async () => {
    const wrapper = mountDialog({ busy: true });
    const [cancel, confirm] = buttons(wrapper);

    expect(cancel?.attributes("disabled")).toBeDefined();
    expect(confirm?.attributes("disabled")).toBeDefined();
    expect(wrapper.find(".spinner").exists()).toBe(true);

    await confirm?.trigger("click");
    expect(wrapper.emitted("confirm")).toBeUndefined();
  });

  it("сбрасывает введённую фразу при повторном открытии", async () => {
    const wrapper = mountDialog({ confirmPhrase: "my-plugin" });

    await wrapper.find("input").setValue("my-plugin");
    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });

    expect((wrapper.find("input").element as HTMLInputElement).value).toBe("");
    expect(buttons(wrapper)[1]?.attributes("disabled")).toBeDefined();
  });
});
