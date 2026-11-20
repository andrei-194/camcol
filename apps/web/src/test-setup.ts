import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto' // IndexedDB global para el `db` singleton en pruebas de pantallas
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// Con `globals: false` Testing Library no limpia solo el DOM entre pruebas.
afterEach(() => cleanup())

// Con toda la suite en paralelo, `findBy*` y `waitFor` a veces pasan de 1 s (el valor por defecto) aunque cada prueba sola
// corra en milisegundos. 3 s da margen y, junto con `testTimeout` de 15 s (vite.config.ts), un fallo real sigue mostrando
// su mensaje en vez de «Test timed out».
configure({ asyncUtilTimeout: 3000 })
