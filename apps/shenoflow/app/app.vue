<template>
  <main class="min-h-screen bg-sheno-bg-base p-8 text-sheno-text-primary">
    <h1 class="text-3xl font-semibold">ShenoFlow Logistics</h1>
    <p class="text-sheno-text-secondary">Logistics orchestration for ShenoDev tenants.</p>

    <!--
      UI_UX_Brief.md §150: on ShenoFlow, cyan #22d3ee means the delivery state,
      and primary buttons shift to #06B6D4 so "click here" and "it's moving"
      never read as the same thing. This is the one app where the primary
      button is NOT bg-sheno-primary.
    -->
    <button
      type="button"
      data-testid="primary-action"
      class="mt-6 cursor-pointer rounded-lg border border-transparent bg-sheno-primary-hover px-5 py-2.5 font-semibold text-sheno-bg-base hover:bg-sheno-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sheno-focus-ring"
    >
      Assign route
    </button>

    <!-- §5: status chips are filled, and always pair colour with a text label
         and an icon. Colour alone fails colorblind users. -->
    <p class="mt-6">
      <span
        data-testid="status-out-for-delivery"
        class="inline-flex items-center gap-2 rounded-full bg-sheno-primary px-3 py-1 text-sm font-semibold text-sheno-bg-base"
      >
        <span aria-hidden="true">&#9679;</span>
        Out for Delivery
      </span>
    </p>
  </main>
</template>