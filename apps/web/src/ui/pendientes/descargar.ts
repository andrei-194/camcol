/** Descarga un archivo JSON desde el navegador (Exportar, RF-SYN-10). Aislado para poder simularlo en pruebas. */
export function descargarJson(nombre: string, contenido: string): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
