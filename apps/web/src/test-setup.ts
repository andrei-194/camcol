import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto' // IndexedDB global para el `db` singleton en pruebas de pantallas
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Con `globals: false` Testing Library no limpia solo el DOM entre pruebas.
afterEach(() => cleanup())
