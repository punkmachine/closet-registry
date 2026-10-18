import { passwordSchema } from "@closet/contract";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import PasswordField from "~/components/PasswordField.vue";
import { useClipboard } from "~/composables/use-clipboard";
import { generatePassword } from "~/utils/password";

vi.stubGlobal("generatePassword", generatePassword);
vi.stubGlobal("useId", () => "pw-1");
vi.stubGlobal("ref", (await import("vue")).ref);
vi.stubGlobal("useClipboard", useClipboard);

describe("PasswordField", () => {
  const mountField = (props: Record<string, unknown> = {}) =>
    mount(PasswordField, { props: { modelValue: "", label: "пароль", ...props } });

  it("не показывает генератор без generator", () => {
    expect(mountField().findAll("button")).toHaveLength(1);
  });

  it("генерирует пароль, проходящий passwordSchema, и показывает его", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const wrapper = mountField({ generator: true });

    await wrapper.findAll("button")[1]?.trigger("click");

    const emitted = wrapper.emitted("update:modelValue")?.[0]?.[0] as string;

    expect(passwordSchema.safeParse(emitted).success).toBe(true);
    expect(writeText).toHaveBeenCalledWith(emitted);
    expect(wrapper.find("input").attributes("type")).toBe("text");
  });
});
