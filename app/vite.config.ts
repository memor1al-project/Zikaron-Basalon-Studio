import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const buildNumber = JSON.parse(readFileSync(new URL('./build-number.json', import.meta.url), 'utf8')).build
const releaseVersion = JSON.parse(
  readFileSync(new URL('./src/releases/current.json', import.meta.url), 'utf8')
).version

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Shown in the sidebar. Debugging a deployed change is guesswork without a way to
    // tell which build the browser actually has.
    __BUILD_ID__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
    // Monotonic across deploys, unlike the timestamp — "build 12" is something a person
    // can quote back, and it orders even when two builds land in the same minute.
    __BUILD_NUMBER__: JSON.stringify(buildNumber),
    __APP_VERSION__: JSON.stringify(releaseVersion),
  },
})
