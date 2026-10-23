// x18n-ignore-file
import { projectList, projectName } from './state'

export interface PromptTarget {
  readonly locale: string
  /** Also update translations older than their source message. */
  readonly stale?: boolean | undefined
  /** Only this key, not every missing message. */
  readonly key?: string | undefined
}

/** A prompt for an agent: it points at the CLI, which prints the messages and how to write them back. */
export function translatePrompt(targets: readonly PromptTarget[]): string {
  const project = (projectList.value?.projects.length ?? 0) > 1
    ? projectName.value
    : undefined
  const flag = project
    ? ` --project ${project}`
    : ''
  const command = ({ locale, stale, key }: PromptTarget): string =>
    `x18n prompt translate --to ${locale}${key
      ? ` --keys ${key}`
      : ''}${stale ? ' --stale' : ''}${flag}`
  const [only] = targets
  if (targets.length === 1 && only) {
    const what = only.key
      ? `the message \`${only.key}\``
      : `the missing${only.stale ? ' and outdated' : ''} messages of this project`
    return [
      `Translate ${what} into ${only.locale} with the x18n CLI.`,
      '',
      `Run \`${command(only)}\` and follow its instructions: it lists the messages with their context and says how to write the translations back.${only.key
        ? ''
        : ` It works in pages, so repeat with the cursor it prints until \`x18n keys --missing ${only.locale}${flag}\` lists nothing.`}`,
    ].join('\n')
  }
  return [
    'Translate the missing messages of this project into each locale below with the x18n CLI.',
    '',
    'For every locale, run its command and follow the instructions it prints: it lists the messages with their context and says how to write the translations back. It works in pages, so repeat with the cursor it prints until `x18n keys --missing <locale>` lists nothing.',
    '',
    ...targets.map(target => `- ${target.locale}: \`${command(target)}\``),
  ].join('\n')
}

/** A prompt for an agent that fixes what `x18n check` reports, all of it or one diagnostic code. */
export function fixPrompt(code?: string): string {
  const project = (projectList.value?.projects.length ?? 0) > 1
    ? projectName.value
    : undefined
  const flags = `${code
    ? ` --only ${code}`
    : ''}${project
    ? ` --project ${project}`
    : ''}`
  return [
    code
      ? `Fix the \`${code}\` diagnostics of this project with the x18n CLI.`
      : 'Fix the diagnostics of this project with the x18n CLI.',
    '',
    `Run \`x18n check${flags}\` to list them. Fix each one at its source: edit the locale files or the code that uses the key, and use \`x18n\` commands to add, rename or remove keys instead of editing by hand where you can. Do not silence a diagnostic in the config.`,
    '',
    `Run \`x18n check${flags}\` again until it reports nothing.`,
  ].join('\n')
}
