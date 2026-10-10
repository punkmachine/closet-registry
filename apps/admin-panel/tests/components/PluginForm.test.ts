import { MAX_FILE_SIZE_BYTES, MAX_FILES_PER_VERSION } from "@closet/contract";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { computed, ref, useTemplateRef, watch } from "vue";
import type PluginFormComponent from "~/components/PluginForm.vue";
import type { PluginFormValues } from "~/utils/plugin-files";

/*
 * PluginForm.vue рассчитан на Nuxt auto-imports (ref/computed/watch/useTemplateRef) и <NuxtLink>.
 * Поднимать целиком Nuxt ради формы избыточно (и заметно медленнее), поэтому auto-imports подставляются
 * глобалами из vue, а NuxtLink — заглушкой. Компонент подгружается динамически, уже после stubGlobal.
 */
vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("watch", watch);
vi.stubGlobal("useTemplateRef", useTemplateRef);

let PluginForm: typeof PluginFormComponent;

beforeAll(async () => {
  PluginForm = (await import("~/components/PluginForm.vue")).default;
});

const mountForm = (props: Record<string, unknown> = {}) =>
  mount(PluginForm, {
    props: { mode: "create", availablePlugins: [], submitting: false, error: null, ...props },
    global: { stubs: { NuxtLink: true } },
  });

/** Подсовывает «выбранные» файлы в input[type=file] (первый — без webkitdirectory) и дёргает change. */
async function pickFiles(wrapper: VueWrapper, files: File[]): Promise<void> {
  const input = wrapper.find("input[type=file]");
  Object.defineProperty(input.element, "files", { value: files, configurable: true });
  await input.trigger("change");
  await flushPromises();
}

const makeFile = (name: string): File => new File(["x"], name);

/** Файл с заявленным размером: реальный контент не создаём, форма до чтения смотрит только на file.size. */
function makeSizedFile(name: string, size: number): File {
  const file = makeFile(name);
  Object.defineProperty(file, "size", { value: size });
  file.arrayBuffer = () => Promise.resolve(new ArrayBuffer(0));
  return file;
}

async function clickButton(wrapper: VueWrapper, label: string): Promise<void> {
  await wrapper
    .findAll("button")
    .find((button) => button.text() === label)
    ?.trigger("click");
}

describe("PluginForm: превентивная валидация лимитов", () => {
  it("отклоняет файл больше MAX_FILE_SIZE_BYTES и не добавляет его в форму", async () => {
    const wrapper = mountForm();

    await pickFiles(wrapper, [makeSizedFile("huge.md", MAX_FILE_SIZE_BYTES + 1)]);

    expect(wrapper.find(".alert--error").text()).toContain("huge.md: больше 10 MB");
    expect(wrapper.findAll(".file-row")).toHaveLength(0);
  });

  it("принимает файл ровно в MAX_FILE_SIZE_BYTES", async () => {
    const wrapper = mountForm();

    await pickFiles(wrapper, [makeSizedFile("edge.md", MAX_FILE_SIZE_BYTES)]);

    expect(wrapper.find(".alert--error").exists()).toBe(false);
    expect(wrapper.findAll(".file-row")).toHaveLength(1);
  });

  it("отклоняет только слишком большой файл из пачки, остальные добавляет", async () => {
    const wrapper = mountForm();

    await pickFiles(wrapper, [makeFile("ok.md"), makeSizedFile("huge.bin", MAX_FILE_SIZE_BYTES + 1)]);

    expect(wrapper.findAll(".file-row")).toHaveLength(1);
    expect(wrapper.find(".alert--error").text()).toContain("huge.bin");
  });

  it("отклоняет всю пачку, если файлов станет больше MAX_FILES_PER_VERSION", async () => {
    const wrapper = mountForm();
    const batch = Array.from({ length: MAX_FILES_PER_VERSION + 1 }, (_, i) => makeFile(`f${i}.md`));

    await pickFiles(wrapper, batch);

    expect(wrapper.find(".alert--error").text()).toContain(`лимит реестра — ${MAX_FILES_PER_VERSION}`);
    expect(wrapper.findAll(".file-row")).toHaveLength(0);
  });

  it("принимает ровно MAX_FILES_PER_VERSION файлов", async () => {
    const wrapper = mountForm();
    const batch = Array.from({ length: MAX_FILES_PER_VERSION }, (_, i) => makeFile(`f${i}.md`));

    await pickFiles(wrapper, batch);

    expect(wrapper.find(".alert--error").exists()).toBe(false);
    expect(wrapper.findAll(".file-row")).toHaveLength(MAX_FILES_PER_VERSION);
  });

  it("учитывает уже добавленные файлы при проверке лимита", async () => {
    const wrapper = mountForm();
    await pickFiles(
      wrapper,
      Array.from({ length: MAX_FILES_PER_VERSION }, (_, i) => makeFile(`f${i}.md`)),
    );

    await pickFiles(wrapper, [makeFile("one-more.md")]);

    expect(wrapper.find(".alert--error").text()).toContain(String(MAX_FILES_PER_VERSION + 1));
    expect(wrapper.findAll(".file-row")).toHaveLength(MAX_FILES_PER_VERSION);
  });
});

describe("PluginForm: сборка значений из строк формы", () => {
  async function fillValid(wrapper: VueWrapper): Promise<void> {
    await wrapper.find("#slug").setValue("  my-plugin  ");
    await wrapper.find("#description").setValue("  Описание  ");
    await wrapper.find("#version").setValue(" 1.2.3 ");
    await clickButton(wrapper, "создать пустой");
    await wrapper.find(".file-row__path").setValue("rules/main.md");
  }

  it("эмитит submit с обрезанными slug/description/version и файлами формы (create -> new)", async () => {
    const wrapper = mountForm();
    await fillValid(wrapper);

    await wrapper.find("form").trigger("submit");

    const emitted = wrapper.emitted("submit");
    expect(emitted).toHaveLength(1);
    const [values, publishMode] = emitted?.[0] as [PluginFormValues, string];
    expect(publishMode).toBe("new");
    expect(values).toMatchObject({ slug: "my-plugin", description: "Описание", version: "1.2.3", dependencies: [] });
    expect(values.files).toHaveLength(1);
    expect(values.files[0]).toMatchObject({ relativePath: "rules/main.md", component: "rules", ai: null });
  });

  it("не эмитит submit при невалидной форме и показывает ошибки", async () => {
    const wrapper = mountForm();
    expect(wrapper.find(".alert--error").exists()).toBe(false);

    await wrapper.find("form").trigger("submit");

    expect(wrapper.emitted("submit")).toBeUndefined();
    const text = wrapper.find(".alert--error").text();
    expect(text).toContain("slug:");
    expect(text).toContain("Нужен хотя бы один файл");
  });

  it("передаёт выбранные зависимости и не предлагает сам плагин в их списке", async () => {
    const updatedAt = "2026-01-01T00:00:00.000Z";
    const wrapper = mountForm({
      availablePlugins: [
        { slug: "base", description: "", latestVersion: "1.0.0", updatedAt },
        { slug: "my-plugin", description: "", latestVersion: "1.0.0", updatedAt },
      ],
    });
    await fillValid(wrapper);

    const options = wrapper.findAll(".chip-row button");
    expect(options).toHaveLength(1);
    await options[0]?.trigger("click");
    await wrapper.find("form").trigger("submit");

    const [values] = wrapper.emitted("submit")?.[0] as [PluginFormValues];
    expect(values.dependencies).toEqual(["base"]);
  });

  it("в режиме edit по умолчанию replace, при выборе новой версии ставит patch+1 и режим new", async () => {
    const wrapper = mountForm({
      mode: "edit",
      initial: {
        slug: "my-plugin",
        description: "d",
        version: "1.2.3",
        changelog: null,
        dependencies: [],
        files: [
          {
            component: "rules",
            ai: null,
            relativePath: "a.md",
            rootPath: false,
            merge: false,
            mergeKeyPath: null,
            template: false,
            sizeBytes: 2,
            sha256: "0".repeat(64),
            encoding: "utf8",
            content: "hi",
          },
        ],
      },
    });

    await wrapper.find("form").trigger("submit");
    expect(wrapper.emitted("submit")?.[0]?.[1]).toBe("replace");

    await wrapper.find("input[type=radio][value=new]").setValue(true);
    expect((wrapper.find("#version").element as HTMLInputElement).value).toBe("1.2.4");

    await wrapper.find("form").trigger("submit");
    const [values, mode] = wrapper.emitted("submit")?.[1] as [PluginFormValues, string];
    expect(mode).toBe("new");
    expect(values.version).toBe("1.2.4");
    expect(values.slug).toBe("my-plugin");
  });
});
