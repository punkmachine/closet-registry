import { ComponentBadge } from "@closet/ui";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

describe("ComponentBadge", () => {
  it("рендерит только component, если ai не задан", () => {
    const wrapper = mount(ComponentBadge, { props: { component: "hooks" } });

    expect(wrapper.classes()).toContain("badge--hooks");
    expect(wrapper.text()).toBe("hooks");
  });

  it("не показывает ai при ai = null", () => {
    const wrapper = mount(ComponentBadge, { props: { component: "rules", ai: null } });

    expect(wrapper.text()).toBe("rules");
  });

  it("добавляет ai через разделитель, когда он задан", () => {
    const wrapper = mount(ComponentBadge, { props: { component: "skills", ai: "codex" } });

    expect(wrapper.classes()).toContain("badge--skills");
    expect(wrapper.text().replaceAll(/\s+/g, " ")).toBe("skills · codex");
  });
});
