<script setup lang="ts">
const frameworks: { name: string, icon: string, to: string, mono?: boolean, color?: string }[] = [
  { name: 'Vue', icon: 'logos:vue', to: '/presets/vue-i18n' },
  { name: 'Nuxt', icon: 'logos:nuxt-icon', to: '/presets/nuxt-i18n' },
  { name: 'React', icon: 'logos:react', to: '/presets/react-i18next' },
  {
    name: 'Next.js',
    icon: 'logos:nextjs-icon',
    to: '/presets/next-intl',
    mono: true,
  },
  { name: 'Svelte', icon: 'logos:svelte-icon', to: '/presets/svelte-i18n' },
  { name: 'Solid', icon: 'logos:solidjs-icon', to: '/presets/solid-primitives-i18n' },
  { name: 'Angular', icon: 'logos:angular-icon', to: '/presets/ngx-translate' },
  {
    name: 'i18next',
    icon: 'simple-icons:i18next',
    to: '/presets/i18next',
    color: '#26a69a',
  },
  {
    name: 'Fluent',
    icon: 'logos:mozilla',
    to: '/presets/fluent-react',
    mono: true,
  },
  { name: 'Astro', icon: 'logos:astro-icon', to: '/presets/paraglide' },
  { name: 'Gravity UI', icon: 'ph:planet-bold', to: '/presets/gravity-ui-i18n' },
  { name: 'Ember', icon: 'logos:ember', to: '/presets/ember-intl' },
  { name: 'Shopify', icon: 'logos:shopify', to: '/presets/i18next-shopify' },
  { name: 'SAP', icon: 'logos:sap', to: '/presets/ui5' },
  { name: 'Laravel', icon: 'logos:laravel', to: '/presets/laravel' },
  { name: 'Joomla', icon: 'logos:joomla', to: '/presets/php-joomla' },
  { name: 'PHP', icon: 'logos:php', to: '/presets/php-gettext' },
  { name: 'Rails', icon: 'logos:rails', to: '/presets/ruby-rails' },
  { name: 'Jekyll', icon: 'devicon:jekyll', to: '/presets/jekyll' },
  { name: 'Flutter', icon: 'logos:flutter-icon', to: '/presets/flutter' },
  { name: 'Python', icon: 'logos:python', to: '/presets/python-gettext' },
  { name: 'Django', icon: 'logos:django-icon', to: '/presets/python-gettext' },
  {
    name: 'Flask',
    icon: 'logos:flask',
    to: '/presets/python-gettext',
    mono: true,
  },
  {
    name: 'Rust',
    icon: 'logos:rust',
    to: '/presets/cargo-i18n',
    mono: true,
  },
  { name: '.NET', icon: 'logos:dotnet', to: '/presets/dotnet-resx' },
  { name: 'Chrome', icon: 'logos:chrome', to: '/presets/chrome-extension' },
  { name: 'Firefox', icon: 'logos:firefox', to: '/presets/chrome-extension' },
  { name: 'VS Code', icon: 'logos:visual-studio-code', to: '/presets/vscode-extension' },
]
</script>

<template>
  <div class="x18n-frameworks my-10 flex flex-col items-center gap-6 text-center not-prose">
    <h3 class="text-sm font-medium uppercase tracking-wider text-muted">
      Supported Frameworks
    </h3>
    <ul class="flex flex-wrap justify-center gap-3 max-w-3xl">
      <li v-for="item in frameworks" :key="item.name">
        <NuxtLink
          :to="item.to"
          :title="item.name"
          :aria-label="item.name"
          class="flex h-14 items-center justify-center rounded-lg border border-default bg-elevated/50 px-4 transition duration-200 hover:border-accented hover:bg-elevated"
        >
          <UIcon
            :name="item.icon"
            mode="svg"
            class="h-7 w-auto"
            :class="item.mono && 'dark:invert'"
            :style="item.color ? { color: item.color } : undefined"
          />
        </NuxtLink>
      </li>
    </ul>
    <UButton to="/presets" color="neutral" variant="soft" trailing-icon="i-ph-arrow-right" label="Check full list" />
  </div>
</template>
