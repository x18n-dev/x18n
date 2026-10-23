import { DevTools } from '@vitejs/devtools'
import { X18nDevtools } from '../src/vite'

/** Plain JS: with the types of `@vitejs/devtools` in the program, TypeScript loses the `x18n:*` RPC types on devframe. */
export default {
  plugins: [
    DevTools(),
    X18nDevtools(),
  ],
}
