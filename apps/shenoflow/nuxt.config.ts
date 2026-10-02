// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  // ShenoDev design tokens. Single source of truth is @shenodev/ui, which
  // mirrors docs/UI_UX_Brief.md. Nothing in this app hardcodes a brand colour.
  css: ['@shenodev/ui/tokens.css', '@shenodev/ui/primary-button.css'],
  app: {
    head: {
      title: 'ShenoFlow',
      meta: [{ name: 'description', content: 'Logistics orchestration for ShenoDev tenants.' }],
    },
  },
})