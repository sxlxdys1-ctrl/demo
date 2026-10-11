const cache = new Map<string, string>()

export function iconUrl(id: string, blockColor?: string): string {
  const cached = cache.get(id)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 16
  const ctx = canvas.getContext('2d')!
  let seed = [...id].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 17)
  const hue = seed % 360
  const color = blockColor ?? `hsl(${hue} 51% 58%)`
  const pixel = (x: number, y: number, fill: string, w = 1, h = 1) => {
    ctx.fillStyle = fill
    ctx.fillRect(x, y, w, h)
  }
  const tool = /(?:sword|pickaxe|_axe|shovel|_hoe|mace)$/.test(id)
  const gun = id === 'pistol' || id === 'rifle'
  const egg = id.endsWith('_spawn_egg')
  const metal = /(?:ingot|nugget|scrap)$/.test(id)
  const food = /apple|bread|carrot|potato|beef|porkchop|chicken|mutton|fish|salmon|cookie|melon|berry|pie|stew/.test(id)
  const block = !!blockColor
  if (block) {
    pixel(1, 2, '#344343', 14, 13)
    pixel(2, 1, '#ffffff', 12, 2)
    pixel(2, 3, color, 12, 11)
    for (let y = 3; y < 14; y++) for (let x = 2; x < 14; x++) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      if ((seed & 7) === 0) pixel(x, y, '#ffffff28')
      else if ((seed & 7) === 1) pixel(x, y, '#162a2a2d')
    }
    pixel(2, 3, '#ffffff66', 1, 10)
    pixel(13, 3, '#132c2c55', 1, 11)
    pixel(2, 13, '#132c2c55', 12, 1)
  } else if (tool) {
    for (let i = 0; i < 9; i++) pixel(3 + i, 12 - i, '#755039', 2, 2)
    for (let i = 0; i < 6; i++) pixel(7 + i, 8 - i, color, 3, 2)
    pixel(11, 2, '#ffffffaa', 2, 2)
  } else if (gun) {
    pixel(2, 5, '#374451', id === 'rifle' ? 13 : 10, 4)
    pixel(2, 5, '#b9c2c2', id === 'rifle' ? 13 : 10, 1)
    pixel(4, 9, '#775a42', 3, 5)
    pixel(11, 7, '#283944', 4, 2)
    pixel(7, 9, '#283944', 2, 2)
  } else if (egg) {
    for (let y = 2; y < 15; y++) for (let x = 2; x < 14; x++) {
      const dx = (x - 7.5) / (y < 6 ? 4 : 5), dy = (y - 8) / 7
      if (dx * dx + dy * dy < 1) pixel(x, y, (x * 3 + y * 7 + seed) % 11 < 3 ? '#f4e5bd' : color)
    }
  } else if (metal) {
    pixel(2, 5, '#425050', 12, 8)
    pixel(4, 3, '#ffffff99', 8, 2)
    pixel(3, 5, color, 10, 6)
    pixel(4, 5, '#ffffff88', 8, 2)
    pixel(3, 11, '#1c303055', 10, 1)
  } else if (food) {
    for (let y = 3; y < 14; y++) for (let x = 2; x < 14; x++) {
      if (((x - 7.5) / 6) ** 2 + ((y - 8) / 5.5) ** 2 < 1) pixel(x, y, color)
    }
    pixel(7, 1, '#5a763f', 2, 3)
    pixel(4, 5, '#ffffff88', 2, 2)
    pixel(11, 10, '#293a2a55', 2, 2)
  } else {
    pixel(4, 2, '#ffffff99', 8, 2)
    pixel(2, 4, '#34424a', 12, 10)
    pixel(3, 4, color, 10, 9)
    pixel(4, 5, '#ffffff66', 3, 2)
    pixel(9, 10, '#1d303055', 3, 2)
  }
  const url = canvas.toDataURL('image/png')
  cache.set(id, url)
  return url
}
