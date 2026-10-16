<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TodoList from './components/TodoList.vue'

const { t } = useI18n()
const page = ref<'home' | 'about' | 'settings'>('home')
const user = 'Ada'
document.title = t('app.title')
</script>

<template>
  <header>
    <h1>{{ $t('app.greeting', { name: user }) }}</h1>
    <nav>
      <a @click="page = 'home'">{{ t('nav.home') }}</a>
      <a v-t="'nav.about'" @click="page = 'about'" />
      <a @click="page = 'settings'">{{ $t('nav.settings') }}</a>
      <a>{{ $t('nav.contact') }}</a>
    </nav>
  </header>
  <main>
    <h2>{{ $t(`pages.${page}.title`) }}</h2>
    <TodoList />
    <button title="Refresh the page">Reload</button>
  </main>
  <footer>
    <i18n-t keypath="app.footer" tag="p" />
  </footer>
</template>
