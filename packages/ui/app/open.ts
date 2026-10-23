import { computed } from 'vue'
import { backend, projectName } from './state'

/** True when the server can open files in the user's editor. */
export const canOpenInEditor = computed(() => Boolean(backend.value?.capabilities.openInEditor && projectName.value))

/** Opens a project-relative path in the editor; positions are 1-based. */
export function openInEditor(path: string, line = 1, column = 1): void {
  if (canOpenInEditor.value) {
    void backend.value!.openInEditor({
      project: projectName.value!,
      path,
      line,
      column,
    })
  }
}
