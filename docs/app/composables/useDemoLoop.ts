type Sleep = (ms: number) => Promise<void>

interface DemoLoopHooks {
  /** Fires before each run with its total duration in ms. */
  start?: (ms: number) => void
  /** Fires after each full run. */
  done?: () => void
}

/**
 * Runs `run` in a loop while the component is mounted. `run` awaits `sleep`
 * between steps; unmounting makes the next `sleep` reject, which ends the loop.
 * With reduced motion, `rest` shows the final state once and nothing animates.
 */
export function useDemoLoop(run: (sleep: Sleep) => Promise<void>, rest?: () => void, hooks: DemoLoopHooks = {}): void {
  let stopped = false
  const sleep: Sleep = ms => new Promise((resolve, reject) => {
    setTimeout(() => (stopped
      ? reject(new Error('stopped'))
      : resolve()), ms)
  })

  // A dry run with instant sleeps sums up the duration. Every run resets its own
  // state first, so this leaves no trace before the first real run.
  async function measure(): Promise<number> {
    let total = 0
    await run((ms) => {
      total += ms
      return Promise.resolve()
    })
    return total
  }

  onMounted(async (): Promise<void> => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      rest?.()
      return
    }
    try {
      const total = await measure()
      // `stopped` flips on unmount while `run` is awaiting.
      // eslint-disable-next-line no-unmodified-loop-condition
      while (!stopped) {
        hooks.start?.(total)
        await run(sleep)
        hooks.done?.()
        // Gives a tab switch time to unmount this pane before it restarts.
        await sleep(400)
      }
    }
    catch {}
  })
  onBeforeUnmount(() => {
    stopped = true
  })
}
