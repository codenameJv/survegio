import { setupWorker } from 'msw/browser'

// Handlers
import { handlerAuth } from '@db/auth/index'

const worker = setupWorker(
  ...handlerAuth,
)

export default function () {
  const workerUrl = `${import.meta.env.BASE_URL ?? '/'}mockServiceWorker.js`

  worker.start({
    serviceWorker: {
      url: workerUrl,
    },
    onUnhandledRequest: 'bypass',
  })
}
