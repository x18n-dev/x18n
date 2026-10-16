<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const todos = ref<string[]>([])
const placeholder = t('todo.add')
</script>

<template>
  <section>
    <input :placeholder="placeholder">
    <p v-if="todos.length === 0">{{ t('todo.empty') }}</p>
    <p v-else>{{ t('todo.count', todos.length) }}</p>
    <p>{{ t('local.hint') }}</p>
    <p>Press enter to save</p>
  </section>
</template>

<i18n lang="json">
{
  "en": { "local": { "hint": "Tasks are kept in memory" } },
  "de": { "local": { "hint": "Aufgaben bleiben im Speicher" } }
}
</i18n>
