import * as THREE from 'three'

export const BLOCKS = [
  { id: 'grass', name: '青草', english: 'grass', color: '#78b65a' },
  { id: 'dirt', name: '泥土', english: 'dirt', color: '#9a6847' },
  { id: 'stone', name: '石头', english: 'stone', color: '#a0a4a8' },
  { id: 'wood', name: '原木', english: 'wood', color: '#a77a51' },
  { id: 'leaves', name: '树叶', english: 'leaves', color: '#4d965f' },
  { id: 'sand', name: '沙子', english: 'sand', color: '#e6cc86' },
  { id: 'brick', name: '红砖', english: 'brick', color: '#c37666' },
  { id: 'glass', name: '琉璃', english: 'glass', color: '#a5d9dd' },
] as const

export type BlockId = (typeof BLOCKS)[number]['id']
type Voxel = BlockId | null

const blockColor = new Map<BlockId, THREE.Color>(
  BLOCKS.map((block) => [block.id, new THREE.Color(block.color)]),
)

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

  constructor() {
    this.mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    )
    this.mesh.receiveShadow = true
    this.generate()
  }

  private generate(): void {
    for (let x = -this.radius; x < this.radius; x++) {
      for (let z = -this.radius; z < this.radius; z++) {
        const nearSpawn = Math.abs(x) < 4 && Math.abs(z) < 4
        const wave = Math.sin(x * 0.27) * 0.8 + Math.cos(z * 0.24) * 0.75
        const height = nearSpawn ? 3 : Math.max(1, Math.min(6, Math.floor(3.2 + wave + hash(x, z) * 0.8)))
        for (let y = 0; y <= height; y++) {
          const type: BlockId = y === height ? (height <= 2 ? 'sand' : 'grass') : y >= height - 2 ? 'dirt' : 'stone'
          this.blocks.set(key(x, y, z), type)
        }
        if (!nearSpawn && height >= 3 && hash(x * 3, z * 7) > 0.994) {
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
      const baseColor = blockColor.get(type)!
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
