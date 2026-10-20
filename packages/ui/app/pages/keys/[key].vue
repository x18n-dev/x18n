<script setup lang="ts">
import type { Fix, MessageLeaf } from '@x18n/core'
import type { UiEditOp, UsageView } from '../../../src/node/types'
import { computed, ref } from 'vue'
import { NuxtLink } from '#components'
import { useRoute } from '#imports'
import ChangeInfo from '../../components/ChangeInfo.vue'
import CodeSnippet from '../../components/CodeSnippet.vue'
import CopyPrompt from '../../components/CopyPrompt.vue'
import FilePath from '../../components/FilePath.vue'
import LocaleFlag from '../../components/LocaleFlag.vue'
import MessageText from '../../components/MessageText.vue'
import UiPage from '../../components/ui/UiPage.vue'
import UiSection from '../../components/ui/UiSection.vue'
import { applyEdit, describeProblem, setMessage } from '../../edit'
import { t } from '../../i18n'
import { backend, currentProject, projectName, useLive, visibleLocales } from '../../state'

const route = useRoute()
const key = computed(() => String(route.params.key))
const detail = useLive((b, project) => b.key(project, key.value))

const rows = computed(() => visibleLocales.value.map(locale => ({
  locale: locale.code,
  message: detail.value?.messages.find(m => m.locale === locale.code),
})))
const sourceValue = computed(() => detail.value?.messages.find(m => m.locale === currentProject.value?.sourceLocale)?.value)

const editing = ref<{ locale: string, draft: string }>()
const problem = ref<string>()

async function save(force = false): Promise<void> {
  const edit = editing.value
  if (!edit)
    return
  const result = await setMessage(key.value, edit.locale, edit.draft, force)
  if (result.applied) {
    editing.value = undefined
    problem.value = undefined
  }
  else {
    problem.value = result.problems.map(describeProblem).join('; ')
  }
}

function edit(locale: string, value: MessageLeaf | undefined): void {
  editing.value = { locale, draft: value === undefined || value === null ? '' : String(value) }
  problem.value = undefined
}

function isUiOp(op: Fix['ops'][number]): op is UiEditOp {
  return op.type !== 'extract' && op.type !== 'format'
}

function openUsage(usage: UsageView): void {
  void backend.value?.openInEditor({ project: projectName.value, path: usage.path, line: usage.line, column: usage.column })
}
</script>

<template>
  <UiPage>
    <header class="flex items-center gap-3 border-b border-base px-4 py-4">
      <NuxtLink to="/keys" class="btn-icon" :aria-label="t('detail.back')">
        <span class="i-ph-arrow-left" />
      </NuxtLink>
      <div class="grid gap-1">
        <span class="label">{{ t('detail.label') }}</span>
        <h1 class="break-all font-mono text-xl font-medium">
          {{ key }}
        </h1>
      </div>
      <span v-if="detail?.namespace" class="badge self-end">{{ detail.namespace }}</span>
    </header>

    <p v-if="detail === null" class="px-4 py-3 color-muted">
      {{ t('detail.notFound') }}
    </p>

    <template v-else-if="detail">
      <UiSection index="01" :title="t('detail.values')">
        <p v-if="!rows.length" class="px-4 py-3 color-muted">
          {{ t('localeBar.noneShown') }}
        </p>
        <div v-for="row in rows" :key="row.locale" class="grid grid-cols-[7rem_1fr_auto] items-start gap-4 border-b border-base px-4 py-3 last:border-b-0" :data-locale="row.locale">
          <span class="flex items-center gap-2 pt-0.5 font-mono">
            <LocaleFlag :code="row.locale" />
            {{ row.locale }}
            <span v-if="row.locale === currentProject?.sourceLocale" class="badge">{{ t('overview.source') }}</span>
            <span v-if="row.message?.outdated" class="badge border-current color-warn" :title="t('history.outdatedHint')">{{ t('history.outdated') }}</span>
          </span>
          <div v-if="editing?.locale === row.locale" class="grid gap-2">
            <textarea v-model="editing.draft" class="input h-auto py-1.5 font-mono" rows="2" :aria-label="t('keys.editValue', { key, locale: row.locale })" @keydown.enter.exact.prevent="save()" @keydown.escape="editing = undefined" />
            <p v-if="problem" class="flex items-center gap-2 color-warn">
              <span class="i-ph-warning" />
              {{ problem }}
              <button class="btn-outline h-7" @click="save(true)">
                {{ t('edit.saveAnyway') }}
              </button>
            </p>
          </div>
          <div v-else class="grid min-w-0 gap-1">
            <MessageText :value="row.message?.value" :placeholders="row.message?.placeholders ?? []" />
            <dl v-if="row.message?.sourceThen !== undefined" class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-l-2 border-[var(--x-warn)] py-0.5 pl-3 text-xs">
              <dt class="label">
                {{ t('history.sourceThen') }}
              </dt>
              <dd class="color-muted line-through decoration-[var(--x-faint)]">
                <MessageText :value="row.message.sourceThen" />
              </dd>
              <dt class="label">
                {{ t('history.sourceNow') }}
              </dt>
              <dd><MessageText :value="sourceValue" /></dd>
            </dl>
            <div v-if="row.message" class="flex flex-wrap items-center gap-x-4 gap-y-1">
              <FilePath :path="row.message.path" :line="row.message.line" class="color-muted" />
              <ChangeInfo v-if="row.message.changed" :change="row.message.changed" />
            </div>
          </div>
          <div class="flex gap-1">
            <button v-if="backend?.capabilities.write && editing?.locale !== row.locale" class="btn-icon h-7 w-7" :title="t('detail.edit')" @click="edit(row.locale, row.message?.value)">
              <span class="i-ph-pencil-simple" />
            </button>
            <CopyPrompt v-if="row.locale !== currentProject?.sourceLocale" :query="{ project: projectName, locale: row.locale, keys: [key] }" />
          </div>
        </div>
      </UiSection>

      <UiSection v-if="detail.diagnostics.length" index="02" :title="t('detail.diagnostics')">
        <div v-for="(d, i) in detail.diagnostics" :key="i" class="flex items-center gap-2 border-b border-base px-4 py-2 last:border-b-0">
          <span :class="d.severity === 'error' ? 'i-ph-x-circle color-error' : 'i-ph-warning color-warn'" />
          <span class="font-mono text-xs color-muted">{{ d.code }}</span>
          <span class="flex-auto">{{ d.message }}</span>
          <template v-if="backend?.capabilities.write">
            <button v-for="fix in d.fixes.filter(f => f.ops.every(isUiOp))" :key="fix.title" class="btn-outline h-7" @click="applyEdit(fix.ops.filter(isUiOp))">
              {{ fix.title }}
            </button>
          </template>
        </div>
      </UiSection>

      <UiSection index="03" :title="t('detail.usages', { count: detail.usages.length })">
        <p v-if="!detail.usages.length" class="px-4 py-3 color-muted">
          {{ t('detail.noUsages') }}
        </p>
        <div v-for="(usage, i) in detail.usages" :key="i" class="grid gap-2 border-b border-base px-4 py-3 last:border-b-0">
          <div class="flex items-center gap-2">
            <FilePath :path="usage.path" :line="usage.line" :column="usage.column" />
            <span v-if="usage.possible" class="badge">{{ t('detail.possible') }}</span>
            <span class="flex-auto" />
            <button v-if="backend?.capabilities.openInEditor" class="btn-ghost h-7" @click="openUsage(usage)">
              <span class="i-ph-arrow-square-out" /> {{ t('detail.openInEditor') }}
            </button>
          </div>
          <CodeSnippet :usage="usage" />
        </div>
      </UiSection>
    </template>
  </UiPage>
</template>
