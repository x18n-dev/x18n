type SfcCompiler = typeof import('@vue/compiler-sfc')
let compiler: Promise<SfcCompiler> | undefined

export function loadVueCompiler(): Promise<SfcCompiler> {
  compiler ??= import('@vue/compiler-sfc')
  return compiler
}
