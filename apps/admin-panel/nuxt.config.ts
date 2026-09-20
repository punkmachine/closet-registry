// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },

  css: ["~/assets/css/main.css"],

  // Оба ключа — server-only (не внутри `public`), поэтому в браузерный бандл не попадают:
  // ADMIN_TOKEN виден только Nitro-прокси в server/api/**. Дефолты пустые, чтобы токен
  // не запекался в образ на этапе `nuxt build` — значения читаются из окружения в рантайме
  // (см. server/utils/registry.ts: fallback на REGISTRY_URL/ADMIN_TOKEN без префикса NUXT_).
  runtimeConfig: {
    registryUrl: "",
    registryToken: "",
  },

  nitro: {
    preset: "node-server",
  },

  app: {
    head: {
      title: "closet-registry · admin",
      htmlAttrs: { lang: "ru" },
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "robots", content: "noindex, nofollow" },
      ],
    },
  },
});
