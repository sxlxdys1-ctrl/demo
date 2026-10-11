import * as THREE from 'three'

export type BlockInfo = { id: string; name: string; english: string; color: string }
export const BLOCKS: BlockInfo[] = [
  { id: 'grass', name: '青草', english: 'grass', color: '#78b65a' },
  { id: 'dirt', name: '泥土', english: 'dirt', color: '#9a6847' },
  { id: 'stone', name: '石头', english: 'stone', color: '#a0a4a8' },
  { id: 'wood', name: '原木', english: 'wood', color: '#a77a51' },
  { id: 'leaves', name: '树叶', english: 'leaves', color: '#4d965f' },
  { id: 'sand', name: '沙子', english: 'sand', color: '#e6cc86' },
  { id: 'brick', name: '红砖', english: 'brick', color: '#c37666' },
  { id: 'glass', name: '琉璃', english: 'glass', color: '#a5d9dd' },
  { id: 'netherrack', name: '下界岩', english: 'netherrack', color: '#8a494b' },
  { id: 'nether_bricks', name: '下界砖', english: 'nether bricks', color: '#503942' },
  { id: 'blackstone', name: '黑石', english: 'blackstone', color: '#494950' },
  { id: 'soul_sand', name: '灵魂沙', english: 'soul sand', color: '#715b4b' },
  { id: 'end_stone', name: '末地石', english: 'end stone', color: '#d2d2aa' },
  { id: 'obsidian', name: '黑曜石', english: 'obsidian', color: '#352d44' },
  { id: 'stone_bricks', name: '石砖', english: 'stone bricks', color: '#a2a09c' },
  { id: 'end_portal_frame', name: '末地传送门框架', english: 'end portal frame', color: '#5a8b79' },
  { id: 'purpur_block', name: '紫珀块', english: 'purpur block', color: '#b98dbd' },
  { id: 'crafting_table', name: '工作台', english: 'crafting table', color: '#b78354' },
  { id: 'fire', name: '火焰', english: 'fire', color: '#f49436' },
  ...(['east', 'west', 'north', 'south'] as const).flatMap((direction) => [
    { id: `painting_${direction}`, name: '画', english: 'painting', color: '#a67251' },
    { id: `item_frame_${direction}`, name: '物品展示框', english: 'item frame', color: '#ad824d' },
  ]),
]

export type BlockId = string
export type Dimension = 'overworld' | 'nether' | 'end' | 'end_city'
type Voxel = BlockId | null

function makeAtlas(): THREE.CanvasTexture {
  const width = 512
  const height = Math.ceil((BLOCKS.length + 2) / 32) * 16
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  const image = context.createImageData(width, height)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const offset = (y * width + x) * 4
    image.data[offset] = image.data[offset + 1] = image.data[offset + 2] = image.data[offset + 3] = 255
  }
  BLOCKS.forEach((block, index) => {
    const bx = ((index + 1) % 32) * 16
    const by = Math.floor((index + 1) / 32) * 16
    const raw = block.color.slice(1)
    const base = [0, 2, 4].map((offset) => parseInt(raw.slice(offset, offset + 2), 16))
    let seed = [...block.id].reduce((sum, char) => (sum * 33 + char.charCodeAt(0)) >>> 0, 5381)
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      const grain = (seed & 255) / 255
      let rgb = base
      let shade = 0.78 + grain * 0.43
      if (block.id === 'wood') { rgb = x % 4 === 0 ? [102, 70, 41] : [174, 129, 81]; shade = 0.88 + grain * 0.22 }
      if (block.id === 'brick' || block.id === 'nether_bricks') {
        const seam = y % 5 === 0 || (x + (Math.floor(y / 5) % 2) * 7) % 8 === 0
        if (seam) shade *= 0.55
      }
      if (block.id === 'crafting_table' && (x === 1 || x === 8 || x === 15 || y === 1 || y === 8 || y === 15)) shade *= 0.58
      if (block.id === 'fire') { rgb = grain > y / 19 ? [255, 207, 89] : [235, 101, 44]; shade = 1 }
      const offset = ((by + y) * width + bx + x) * 4
      for (let c = 0; c < 3; c++) image.data[offset + c] = Math.min(255, rgb[c] * shade)
      image.data[offset + 3] = 255
    }
  })
  const grassSideTile = BLOCKS.length + 1
  const gx = grassSideTile % 32 * 16, gy = Math.floor(grassSideTile / 32) * 16
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const offset = ((gy + y) * width + gx + x) * 4
    const rgb = y < 4 ? [104, 172, 78] : [140, 98, 69]
    const shade = 0.86 + ((x * 17 + y * 29) % 9) / 40
    for (let c = 0; c < 3; c++) image.data[offset + c] = rgb[c] * shade
    image.data[offset + 3] = 255
  }
  context.putImageData(image, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  return texture
}

export function registerCustomBlock(id: string, name: string, color: string): boolean {
  if (!/^custom_[a-z0-9_]{1,36}$/.test(id) || !/^#[0-9a-fA-F]{6}$/.test(color) || BLOCKS.some((block) => block.id === id)) return false
  BLOCKS.push({ id, name: name.slice(0, 24), english: id, color })
  return true
}

export function registerCatalogBlock(id: string, name: string): void {
  if (BLOCKS.some((block) => block.id === id)) return
  const dyes: Record<string, string> = {
    white: '#e9e7df', light_gray: '#a5a6a4', gray: '#65666a', black: '#333238', brown: '#77533c',
    red: '#b7584e', orange: '#d99050', yellow: '#e6ca63', lime: '#9bc36a', green: '#5c936a',
    cyan: '#62afb0', light_blue: '#87c8db', blue: '#5577b7', purple: '#9875b6', magenta: '#c978ae', pink: '#e4a4b8',
  }
  const dye = Object.keys(dyes).sort((a, b) => b.length - a.length).find((key) => id.startsWith(key + '_'))
  const color = dye ? dyes[dye] : /planks|_log|_wood|bookshelf|barrel|chest/.test(id) ? '#aa8055'
    : /leaves|moss|grass|vine|sapling|flower|bamboo/.test(id) ? '#6fa05b'
      : /sand|sandstone|end_stone/.test(id) ? '#d7c492'
        : /brick|terracotta|mud/.test(id) ? '#a66d5a'
          : /gold|honey/.test(id) ? '#e3bd59'
            : /copper/.test(id) ? '#bf8769'
              : /diamond|prismarine/.test(id) ? '#72c5c4'
                : /nether|crimson|netherrack/.test(id) ? '#8b5154'
                  : /obsidian|blackstone|deepslate/.test(id) ? '#51505c'
                    : /glass|ice/.test(id) ? '#b3dadd' : '#a4a5a0'
  BLOCKS.push({ id, name, english: id.replaceAll('_', ' '), color })
}

const faces = [
  { direction: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.83 },
  { direction: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.78 },
  { direction: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.12 },
  { direction: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.58 },
  { direction: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.9 },
  { direction: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.72 },
] as const

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`
}

function hash(x: number, z: number): number {
  const value = Math.sin(x * 127.1 + z * 311.7 + 52.8) * 43758.5453
  return value - Math.floor(value)
}

export class VoxelWorld {
  readonly blocks = new Map<string, BlockId>()
  readonly edits = new Map<string, Voxel>()
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>
  readonly radius = 20
  private atlasSize = 0
  dimension: Dimension

  constructor(dimension: Dimension = 'overworld') {
    this.dimension = dimension
    this.mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: makeAtlas() }),
    )
    this.atlasSize = BLOCKS.length
    this.mesh.receiveShadow = true
    this.generate()
  }

  private generate(): void {
    this.blocks.clear()
    this.edits.clear()
    for (let x = -this.radius; x < this.radius; x++) {
      for (let z = -this.radius; z < this.radius; z++) {
        const nearSpawn = Math.abs(x) < 4 && Math.abs(z) < 4
        const wave = Math.sin(x * 0.27) * 0.8 + Math.cos(z * 0.24) * 0.75
        const height = nearSpawn ? 3 : Math.max(1, Math.min(6, Math.floor(3.2 + wave + hash(x, z) * 0.8)))
        for (let y = 0; y <= height; y++) {
          const type: BlockId = this.dimension === 'nether'
            ? y === height && hash(x * 7, z * 3) > 0.92 ? 'soul_sand' : y < height - 2 ? 'blackstone' : 'netherrack'
            : this.dimension === 'end' || this.dimension === 'end_city' ? 'end_stone'
              : y === height ? (height <= 2 ? 'sand' : 'grass') : y >= height - 2 ? 'dirt' : 'stone'
          this.blocks.set(key(x, y, z), type)
        }
        if (this.dimension === 'overworld' && !nearSpawn && height >= 3 && hash(x * 3, z * 7) > 0.994) {
          for (let y = height + 1; y <= height + 3; y++) this.blocks.set(key(x, y, z), 'wood')
          for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
              for (let dy = 2; dy <= 3; dy++) {
                if (Math.abs(dx) + Math.abs(dz) + (dy === 3 ? 1 : 0) <= 2) {
                  this.blocks.set(key(x + dx, height + dy, z + dz), 'leaves')
                }
              }
            }
          }
          this.blocks.set(key(x, height + 4, z), 'leaves')
        }
      }
    }
    if (this.dimension === 'nether') {
      for (let x = 7; x <= 14; x++) for (let z = 6; z <= 13; z++) {
        const top = this.surfaceTop(x, z)
        this.blocks.set(key(x, top, z), 'nether_bricks')
        if (x === 7 || x === 14 || z === 6 || z === 13) this.blocks.set(key(x, top + 1, z), 'nether_bricks')
      }
      for (let y = 4; y <= 11; y++) for (let x = -14; x <= -10; x++) for (let z = -10; z <= -6; z++) {
        if (y === 4 || y === 11 || x === -14 || x === -10 || z === -10 || z === -6) this.blocks.set(key(x, y, z), 'blackstone')
      }
    }
    if (this.dimension === 'overworld') {
      for (let x = 10; x <= 16; x++) for (let z = -12; z <= -6; z++) {
        const top = this.surfaceTop(x, z)
        if (x === 10 || x === 16 || z === -12 || z === -6) this.blocks.set(key(x, top, z), 'stone_bricks')
        if (x >= 12 && x <= 14 && z >= -10 && z <= -8) this.blocks.set(key(x, top, z), 'end_portal_frame')
      }
    }
    if (this.dimension === 'end') {
      for (const [x, z] of [[-12, -8], [-11, 10], [11, -10], [12, 8]]) {
        for (let y = 4; y <= 11; y++) for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) {
          this.blocks.set(key(x + dx, y, z + dz), 'obsidian')
        }
      }
    }
    if (this.dimension === 'end_city') {
      for (const [x, z] of [[-9, 6], [8, 9], [7, -8]]) {
        for (let y = 4; y <= 11; y++) for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 3; dz++) {
          if (y === 4 || y === 11 || dx === 0 || dx === 2 || dz === 0 || dz === 2) this.blocks.set(key(x + dx, y, z + dz), 'purpur_block')
        }
      }
    }
  }

  setDimension(dimension: Dimension, edits: [string, Voxel][] = []): void {
    this.dimension = dimension
    this.generate()
    this.applyEdits(edits)
  }

  getBlock(x: number, y: number, z: number): Voxel {
    return this.blocks.get(key(x, y, z)) ?? null
  }

  setBlock(x: number, y: number, z: number, block: Voxel): boolean {
    if (x < -this.radius || x >= this.radius || z < -this.radius || z >= this.radius || y < 0 || y > 25) return false
    const id = key(x, y, z)
    if (this.getBlock(x, y, z) === block) return false
    if (block === null) this.blocks.delete(id)
    else this.blocks.set(id, block)
    this.edits.set(id, block)
    this.rebuild()
    return true
  }

  applyEdits(edits: [string, Voxel][]): void {
    for (const [id, block] of edits) {
      if (!/^-?\d+,-?\d+,-?\d+$/.test(id)) continue
      const [x, y, z] = id.split(',').map(Number)
      if (x < -this.radius || x >= this.radius || z < -this.radius || z >= this.radius || y < 0 || y > 25) continue
      if (block !== null && !BLOCKS.some((item) => item.id === block)) continue
      if (block === null) this.blocks.delete(id)
      else this.blocks.set(id, block)
      this.edits.set(id, block)
    }
    this.rebuild()
  }

  surfaceTop(x: number, z: number): number {
    for (let y = 25; y >= 0; y--) {
      const block = this.getBlock(x, y, z)
      if (block && block !== 'fire' && !block.startsWith('painting_') && !block.startsWith('item_frame_')) return y + 1
    }
    return 0
  }

  rebuild(): void {
    if (this.atlasSize !== BLOCKS.length) {
      this.mesh.material.map?.dispose()
      this.mesh.material.map = makeAtlas()
      this.mesh.material.needsUpdate = true
      this.atlasSize = BLOCKS.length
    }
    const positions: number[] = []
    const colors: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    const indices: number[] = []
    const atlasRows = Math.ceil((BLOCKS.length + 2) / 32)
    const addUvs = (tile: number): void => {
      const col = tile % 32, row = Math.floor(tile / 32)
      const u0 = (col * 16 + 0.3) / 512, u1 = (col * 16 + 15.7) / 512
      const v0 = 1 - (row * 16 + 15.7) / (atlasRows * 16)
      const v1 = 1 - (row * 16 + 0.3) / (atlasRows * 16)
      uvs.push(u0, v0, u0, v1, u1, v1, u1, v0)
    }
    const textureIndex = new Map(BLOCKS.map((block, index) => [block.id, index + 1]))

    const addDecorQuad = (x: number, y: number, z: number, direction: string,
      size: number, offset: number, color: string): void => {
      const tint = new THREE.Color(color)
      const edge = (1 - size) / 2
      const vertex = positions.length / 3
      const corners = [[edge, edge], [1 - edge, edge], [1 - edge, 1 - edge], [edge, 1 - edge]]
      for (const [u, v] of corners) {
        if (direction === 'east' || direction === 'west') {
          positions.push(x + (direction === 'east' ? offset : 1 - offset), y + v, z + u)
          normals.push(direction === 'east' ? 1 : -1, 0, 0)
        } else {
          positions.push(x + u, y + v, z + (direction === 'south' ? offset : 1 - offset))
          normals.push(0, 0, direction === 'south' ? 1 : -1)
        }
        colors.push(tint.r, tint.g, tint.b)
      }
      addUvs(0)
      if (direction === 'east' || direction === 'north') indices.push(vertex, vertex + 2, vertex + 1, vertex, vertex + 3, vertex + 2)
      else indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3)
    }

    for (const [id, type] of this.blocks) {
      const [x, y, z] = id.split(',').map(Number)
      if (type.startsWith('painting_') || type.startsWith('item_frame_')) {
        const direction = type.slice(type.startsWith('painting_') ? 9 : 11)
        const painting = type.startsWith('painting_')
        addDecorQuad(x, y, z, direction, painting ? 0.94 : 0.84, 0.035, '#5d402d')
        addDecorQuad(x, y, z, direction, painting ? 0.84 : 0.68, 0.048, painting ? '#e0c7a3' : '#b88955')
        addDecorQuad(x, y, z, direction, painting ? 0.73 : 0.42, 0.061, painting ? '#6c9e9e' : '#dfcf9c')
        if (painting) addDecorQuad(x, y, z, direction, 0.3, 0.068, '#e6ac77')
        continue
      }
      for (const face of faces) {
        const [dx, dy, dz] = face.direction
        if (this.getBlock(x + dx, y + dy, z + dz)) continue
        const vertex = positions.length / 3
        for (const [cx, cy, cz] of face.corners) {
          positions.push(x + cx, y + cy, z + cz)
          normals.push(dx, dy, dz)
          colors.push(face.shade, face.shade, face.shade)
        }
        addUvs((type === 'grass' || type === 'grass_block') && dy !== 1 ? BLOCKS.length + 1 : textureIndex.get(type) ?? 0)
        indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3)
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeBoundingSphere()
    this.mesh.geometry.dispose()
    this.mesh.geometry = geometry
  }
}
