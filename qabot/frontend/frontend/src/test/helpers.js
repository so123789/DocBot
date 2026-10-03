/** Create a File with an optional fake size (avoids allocating large buffers). */
export function makeFile(name = 'notes.pdf', { type = 'application/pdf', size, content = '%PDF-1.4' } = {}) {
  const file = new File([content], name, { type })
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size })
  return file
}
