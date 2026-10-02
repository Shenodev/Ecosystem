import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  // ShenoDev design tokens. Single source of truth is @shenodev/ui, a Tailwind
  // v4 theme mirroring docs/UI_UX_Brief.md. Byte-identical to what ShenoStore
  // and ShenoInventory import.
  css: ['@shenodev/ui/theme.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  app: {
    head: {
      title: 'ShenoFlow',
      meta: [{ name: 'description', content: 'Logistics orchestration for ShenoDev tenants.' }],
    },
  },
})