import * as THREE from 'three'
import { type Dimension, VoxelWorld } from './world'

export type MobKind = 'chicken' | 'sheep' | 'cow' | 'pig' | 'zombie' | 'skeleton' | 'hammer_brute' | 'blaze' | 'piglin' | 'enderman' | 'ender_dragon'
export type Mob = {
  id: number
  kind: MobKind
  group: THREE.Group
  health: number
  x: number
  z: number
  direction: number
  actionTimer: number
  attackTimer: number
}

export const mobInfo: Record<MobKind, { name: string; health: number; hostile: boolean; color: number; loot: [string, number][] }> = {
  chicken: { name: '小鸡', health: 4, hostile: false, color: 0xf5eee0, loot: [['chicken', 1]] },
  sheep: { name: '小羊', health: 8, hostile: false, color: 0xf8f6e7, loot: [['mutton', 1], ['white_wool', 3]] },
  cow: { name: '小牛', health: 10, hostile: false, color: 0x765849, loot: [['beef', 2]] },
  pig: { name: '小猪', health: 8, hostile: false, color: 0xf4a6a5, loot: [['porkchop', 2]] },
  zombie: { name: '僵尸', health: 20, hostile: true, color: 0x77a36c, loot: [['rotten_flesh', 1]] },
  skeleton: { name: '骷髅', health: 20, hostile: true, color: 0xdbd7ca, loot: [['bone', 2]] },
  hammer_brute: { name: '重锤怪物', health: 32, hostile: true, color: 0x9d6881, loot: [['heavy_core', 1]] },
  blaze: { name: '烈焰人', health: 20, hostile: true, color: 0xe8a24c, loot: [['blaze_rod', 1]] },
  piglin: { name: '猪灵', health: 24, hostile: true, color: 0xc59077, loot: [['gold_nugget', 4]] },
  enderman: { name: '末影人', health: 30, hostile: true, color: 0x292238, loot: [['ender_pearl', 1]] },
  ender_dragon: { name: '末影龙', health: 200, hostile: true, color: 0x30283f, loot: [['dragon_head', 1]] },
}

function part(width: number, height: number, depth: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshLambertMaterial({ color }))
  mesh.position.set(x, y, z)
  return mesh
}

function makeMob(kind: MobKind): THREE.Group {
  const info = mobInfo[kind]
  const group = new THREE.Group()
  const big = kind === 'ender_dragon'
  const tall = kind === 'enderman'
  const animal = ['chicken', 'sheep', 'cow', 'pig'].includes(kind)
  group.add(part(animal ? 0.8 : 0.7, animal ? 0.6 : tall ? 1.4 : 0.9, animal ? 1 : 0.48, info.color, 0, animal ? 0.7 : tall ? 1.45 : 1.05, 0))
  group.add(part(animal ? 0.45 : 0.55, animal ? 0.45 : 0.58, animal ? 0.4 : 0.5, info.color, 0, animal ? 1.25 : tall ? 2.48 : 1.8, animal ? -0.43 : 0))
  for (const side of [-1, 1]) {
    for (const front of [-1, 1]) {
      group.add(part(0.19, animal ? 0.55 : tall ? 1.4 : 0.9, 0.19, info.color,
        side * (animal ? 0.28 : 0.23), animal ? 0.3 : tall ? 0.7 : 0.44, front * (animal ? 0.31 : 0.1)))
    }
    group.add(part(0.09, 0.09, 0.04, kind === 'enderman' ? 0xcb75ed : 0x233b33,
      side * 0.14, animal ? 1.31 : tall ? 2.52 : 1.85, animal ? -0.65 : -0.27))
  }
  if (kind === 'sheep') group.add(part(0.92, 0.72, 1.06, 0xfffcf0, 0, 0.78, 0))
  if (kind === 'chicken') group.add(part(0.14, 0.12, 0.22, 0xe59a4d, 0, 1.15, -0.7))
  if (kind === 'pig' || kind === 'piglin') group.add(part(0.28, 0.19, 0.2, 0xe99a9b, 0, animal ? 1.17 : 1.75, animal ? -0.68 : -0.35))
  if (kind === 'hammer_brute') group.add(part(0.55, 0.25, 0.25, 0xa8a0aa, 0.62, 1.3, 0))
  if (kind === 'ender_dragon') {
    group.scale.setScalar(3)
    group.add(part(2.1, 0.13, 0.7, 0x3c3450, 0, 1.35, 0))
  }
  return group
}

export class EntityManager {
  readonly mobs: Mob[] = []
  private nextId = 1
  private spawnTimer = 0

  constructor(private scene: THREE.Scene, private world: VoxelWorld) {
    for (const [kind, x, z] of [
      ['chicken', 4, 6], ['sheep', -5, 3], ['cow', 6, -5], ['pig', -6, -6],
    ] as [MobKind, number, number][]) this.spawn(kind, x, z)
  }

  spawn(kind: MobKind, x: number, z: number): Mob {
    const group = makeMob(kind)
    const mob: Mob = {
      id: this.nextId++, kind, group, health: mobInfo[kind].health, x, z,
      direction: Math.random() * Math.PI * 2, actionTimer: 0, attackTimer: 0,
    }
    group.position.set(x, this.world.surfaceTop(Math.floor(x), Math.floor(z)), z)
    for (const child of group.children) child.userData.mobId = mob.id
    this.scene.add(group)
    this.mobs.push(mob)
    return mob
  }

  target(camera: THREE.Camera): Mob | null {
    const ray = new THREE.Raycaster()
    ray.far = 7
    ray.setFromCamera(new THREE.Vector2(0, 0), camera)
    const hit = ray.intersectObjects(this.mobs.map((mob) => mob.group), true)[0]
    if (!hit) return null
    let object: THREE.Object3D | null = hit.object
    while (object && object.userData.mobId === undefined) object = object.parent
    return this.mobs.find((mob) => mob.id === object?.userData.mobId) ?? null
  }

  hit(mob: Mob, damage: number): boolean {
    mob.health -= damage
    mob.group.rotation.z = Math.random() * 0.15
    if (mob.health > 0) return false
    this.scene.remove(mob.group)
    const index = this.mobs.indexOf(mob)
    if (index >= 0) this.mobs.splice(index, 1)
    return true
  }

  tick(dt: number, playerX: number, playerZ: number, dark: boolean, dimension: Dimension, onHit: (damage: number) => void): void {
    this.spawnTimer += dt
    if (this.spawnTimer > 20) {
      this.spawnTimer = 0
      const hostileCount = this.mobs.filter((mob) => mobInfo[mob.kind].hostile).length
      if (dark && hostileCount < 7) {
        const kinds: MobKind[] = dimension === 'nether' ? ['blaze', 'piglin']
          : dimension === 'end' || dimension === 'end_city' ? ['enderman']
            : ['zombie', 'skeleton', 'hammer_brute', 'enderman']
        const angle = Math.random() * Math.PI * 2
        const x = Math.max(-18, Math.min(18, playerX + Math.cos(angle) * 11))
        const z = Math.max(-18, Math.min(18, playerZ + Math.sin(angle) * 11))
        this.spawn(kinds[Math.floor(Math.random() * kinds.length)], x, z)
      }
    }
    for (const mob of this.mobs) {
      const info = mobInfo[mob.kind]
      const distance = Math.hypot(playerX - mob.x, playerZ - mob.z)
      mob.actionTimer -= dt
      mob.attackTimer -= dt
      if (mob.actionTimer <= 0) {
        mob.actionTimer = 1.5 + Math.random() * 3
        mob.direction += (Math.random() - 0.5) * 1.8
      }
      if (info.hostile && distance < 9 && distance > 0.1) mob.direction = Math.atan2(playerZ - mob.z, playerX - mob.x)
      const pace = info.hostile && distance < 9 ? 1.35 : 0.28
      if (distance > 1.4 || !info.hostile) {
        mob.x = Math.max(-18, Math.min(18, mob.x + Math.cos(mob.direction) * dt * pace))
        mob.z = Math.max(-18, Math.min(18, mob.z + Math.sin(mob.direction) * dt * pace))
      }
      mob.group.position.set(mob.x, this.world.surfaceTop(Math.floor(mob.x), Math.floor(mob.z)), mob.z)
      mob.group.rotation.y = -mob.direction - Math.PI / 2
      if (info.hostile && distance < 1.8 && mob.attackTimer <= 0) {
        mob.attackTimer = 2.2
        onHit(mob.kind === 'ender_dragon' ? 8 : mob.kind === 'hammer_brute' ? 5 : 2)
      }
    }
  }

  removeAll(): void {
    for (const mob of this.mobs) this.scene.remove(mob.group)
    this.mobs.length = 0
  }
}
