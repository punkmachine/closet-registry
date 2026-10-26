// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },

  css: ["@closet/ui/tokens.css", "@closet/ui/utilities.css", "~/assets/css/main.css"],

  build: { transpile: ["@closet/ui", "@closet/contract", "@closet/harness-render"] },

  runtimeConfig: {
    registryUrl: "",
  },

  nitro: {
    preset: "node-server",
  },

  app: {
    head: {
      title: "closet-registry · admin",
      htmlAttrs: { lang: "ru" },
      meta: [
        { charset: "utf8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "robots", content: "noindex, nofollow" },
      ],
    },
  },
});
