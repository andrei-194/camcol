import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto' // IndexedDB global para el `db` singleton en pruebas de pantallas
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// Con `globals: false` Testing Library no limpia solo el DOM entre pruebas.
afterEach(() => cleanup())

// Con toda la suite en paralelo, `findBy*` y `waitFor` tardan más de 1 s (el valor por defecto) aunque cada prueba sola
// corra en milisegundos. Un margen común evita fallos intermitentes sin tocar cada prueba.
configure({ asyncUtilTimeout: 5000 })
