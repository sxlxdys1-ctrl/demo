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
]

export type BlockId = string
export type Dimension = 'overworld' | 'nether' | 'end' | 'end_city'
type Voxel = BlockId | null

const blockColor = new Map<BlockId, THREE.Color>(
  BLOCKS.map((block) => [block.id, new THREE.Color(block.color)]),
)

export function registerCustomBlock(id: string, name: string, color: string): boolean {
  if (!/^custom_[a-z0-9_]{1,36}$/.test(id) || !/^#[0-9a-fA-F]{6}$/.test(color) || BLOCKS.some((block) => block.id === id)) return false
  BLOCKS.push({ id, name: name.slice(0, 24), english: id, color })
  blockColor.set(id, new THREE.Color(color))
  return true
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
  dimension: Dimension

  constructor(dimension: Dimension = 'overworld') {
    this.dimension = dimension
    this.mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    )
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
    for (let y = 25; y >= 0; y--) if (this.getBlock(x, y, z)) return y + 1
    return 0
  }

  rebuild(): void {
    const positions: number[] = []
    const colors: number[] = []
    const normals: number[] = []
    const indices: number[] = []

    for (const [id, type] of this.blocks) {
      const [x, y, z] = id.split(',').map(Number)
      const baseColor = blockColor.get(type) ?? new THREE.Color('#c4a9cb')
      for (const face of faces) {
        const [dx, dy, dz] = face.direction
        if (this.getBlock(x + dx, y + dy, z + dz)) continue
        const vertex = positions.length / 3
        for (const [cx, cy, cz] of face.corners) {
          positions.push(x + cx, y + cy, z + cz)
          normals.push(dx, dy, dz)
          colors.push(baseColor.r * face.shade, baseColor.g * face.shade, baseColor.b * face.shade)
        }
        indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3)
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setIndex(indices)
    geometry.computeBoundingSphere()
    this.mesh.geometry.dispose()
    this.mesh.geometry = geometry
  }
}
