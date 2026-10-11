import * as THREE from 'three'
import { BLOCKS, type BlockId, VoxelWorld } from './world'
import './style.css'

const SAVE_KEY = 'tiny-wonder-world-v1'
const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div id="game" aria-label="方块小世界游戏画面"></div>
  <div class="grain" aria-hidden="true"></div>
  <header class="topbar">
    <div class="brand"><span class="brand-mark">✦</span><div><strong>超级好玩的小世界</strong><small>手机浏览器 · 探索先行版</small></div></div>
    <div class="top-actions"><span id="clock" class="glass-pill">☀ 第 1 天 · 12:00</span><button id="menu-button" class="icon-button" aria-label="打开菜单">☰</button></div>
  </header>
  <div id="target-label" class="target-label">滑动屏幕，环顾四周</div>
  <div class="crosshair" aria-hidden="true"><i></i><i></i></div>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <div class="bottom-hud">
    <div class="status-line"><span class="mode-chip">✦ 自由探索</span><span id="mine-count">已挖掘 0 块</span></div>
    <div id="hotbar" class="hotbar" aria-label="快捷物品栏"></div>
  </div>
  <div id="joystick" class="joystick" aria-label="移动摇杆"><div id="joystick-knob" class="joystick-knob"><span>✦</span></div></div>
  <div class="action-controls">
    <button id="inventory-button" class="round-action inventory-action" aria-label="打开背包"><span class="action-icon">▦</span><small>背包</small></button>
    <button id="jump-button" class="round-action jump-action" aria-label="跳跃"><span class="action-icon">↑</span><small>跳跃</small></button>
    <button id="mine-button" class="round-action mine-action" aria-label="挖掘"><span class="action-icon">⚒</span><small>挖掘</small></button>
    <button id="place-button" class="round-action place-action" aria-label="放置"><span class="action-icon">▣</span><small>放置</small></button>
  </div>
  <div id="welcome" class="overlay welcome-overlay">
    <div class="welcome-card">
      <div class="eyebrow">属于你的第一片方块天地</div>
      <div class="welcome-emblem">✦</div>
      <h1>超级好玩的<br><em>小世界</em></h1>
      <p>从一块草地开始，挖出你的灵感，搭起独一无二的小天地。</p>
      <div class="instruction-row"><span>◉ 左边摇杆移动</span><span>↔ 右边滑动视角</span></div>
      <button id="start-button" class="primary-button">进入我的世界 <span>→</span></button>
      <small class="welcome-note">进度保存在此浏览器中 · 建议横屏探索</small>
    </div>
  </div>
  <div id="inventory-panel" class="overlay panel-overlay hidden" role="dialog" aria-modal="true" aria-label="背包">
    <div class="panel inventory-panel">
      <div class="panel-heading"><div><div class="eyebrow">你的方块收藏</div><h2>背包 <span>80 格</span></h2></div><button class="close-button" data-close aria-label="关闭背包">×</button></div>
      <p class="panel-hint">先选一种材料，再点背包格子。前 8 格会显示在底部快捷栏。</p>
      <input id="item-search" class="search-input" type="search" placeholder="搜索材料名称 / English" aria-label="搜索材料" />
      <div id="catalog" class="catalog"></div>
      <div class="grid-label">我的背包 <span>点击格子放入选中的材料</span></div>
      <div id="inventory-grid" class="inventory-grid"></div>
    </div>
  </div>
  <div id="menu-panel" class="overlay panel-overlay hidden" role="dialog" aria-modal="true" aria-label="游戏菜单">
    <div class="panel menu-panel">
      <div class="panel-heading"><div><div class="eyebrow">休息一下</div><h2>游戏菜单</h2></div><button class="close-button" data-close aria-label="关闭菜单">×</button></div>
      <p class="panel-hint">左侧摇杆移动；在右侧空白处滑动可转动视角。准星对准方块后点击挖掘或放置。</p>
      <button id="save-button" class="menu-option">保存当前世界 <span>↗</span></button>
      <button id="reset-button" class="menu-option danger-option">重新生成世界 <span>↻</span></button>
      <button class="primary-button menu-resume" data-close>继续探索 <span>→</span></button>
    </div>
  </div>
`

const world = new VoxelWorld()
const scene = new THREE.Scene()
const daySky = new THREE.Color('#9bd6e7')
const nightSky = new THREE.Color('#122543')
scene.background = daySky.clone()
scene.fog = new THREE.Fog(daySky.clone(), 22, 74)
scene.add(world.mesh)

const ambient = new THREE.HemisphereLight('#ffffff', '#789178', 2.1)
scene.add(ambient)
const sunlight = new THREE.DirectionalLight('#fff4d3', 2.1)
sunlight.position.set(-12, 24, -8)
scene.add(sunlight)

const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 100)
camera.rotation.order = 'YXZ'
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
renderer.outputColorSpace = THREE.SRGBColorSpace
document.querySelector('#game')!.appendChild(renderer.domElement)

const sea = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshLambertMaterial({ color: '#8fc8cb', side: THREE.DoubleSide }),
)
sea.rotation.x = -Math.PI / 2
sea.position.y = -0.4
scene.add(sea)

const clouds: THREE.Group[] = []
for (let i = 0; i < 9; i++) {
  const cloud = new THREE.Group()
  const count = 3 + (i % 3)
  for (let j = 0; j < count; j++) {
    const puff = new THREE.Mesh(
      new THREE.BoxGeometry(3 + (j % 2), 0.7, 1.6),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }),
    )
    puff.position.x = j * 2.4
    puff.position.y = Math.sin(j * 2) * 0.25
    cloud.add(puff)
  }
  cloud.position.set(((i * 17) % 65) - 32, 15 + (i % 3) * 2, ((i * 29) % 65) - 32)
  scene.add(cloud)
  clouds.push(cloud)
}

type SaveData = {
  version: 1
  edits: [string, BlockId | null][]
  inventory: (BlockId | null)[]
  player: { x: number; z: number; foot: number; yaw: number; pitch: number }
  time: number
  day: number
  mined: number
}

function readSave(): SaveData | null {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')
    if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1) return null
    const save = data as SaveData
    if (!Array.isArray(save.edits) || !Array.isArray(save.inventory)) return null
    if (!save.player || ![save.player.x, save.player.z, save.player.foot, save.player.yaw, save.player.pitch].every(Number.isFinite)) return null
    return save
  } catch {
    return null
  }
}

const saved = readSave()
if (saved) world.applyEdits(saved.edits)
else world.rebuild()

const player = {
  x: saved?.player.x ?? 0.5,
  z: saved?.player.z ?? 0.5,
  foot: saved?.player.foot ?? 4,
  yaw: saved?.player.yaw ?? 0,
  pitch: saved?.player.pitch ?? -0.33,
  velocityY: 0,
  grounded: false,
}
if (Math.abs(player.x) > world.radius || Math.abs(player.z) > world.radius || player.foot < -2) {
  player.x = 0.5
  player.z = 0.5
  player.foot = 4
}

const validBlock = (value: unknown): value is BlockId => BLOCKS.some((block) => block.id === value)
const inventory: (BlockId | null)[] = Array.from({ length: 80 }, (_, i) => BLOCKS[i]?.id ?? null)
if (saved) {
  for (let i = 0; i < 80; i++) inventory[i] = validBlock(saved.inventory[i]) ? saved.inventory[i] : null
}

let selectedIndex = 0
let catalogChoice: BlockId = 'grass'
let timeOfDay = Number.isFinite(saved?.time) ? saved!.time % 1 : 0.25
let day = Number.isFinite(saved?.day) ? Math.max(1, Math.floor(saved!.day)) : 1
let mined = Number.isFinite(saved?.mined) ? saved!.mined : 0
let playing = false
let panelOpen = false
let toastTimer = 0

const $ = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector)!
const hotbar = $<HTMLDivElement>('#hotbar')
const catalog = $<HTMLDivElement>('#catalog')
const inventoryGrid = $<HTMLDivElement>('#inventory-grid')
const targetLabel = $<HTMLDivElement>('#target-label')

function swatch(id: BlockId): string {
  const block = BLOCKS.find((item) => item.id === id)!
  return `<span class="block-swatch ${id}" style="--block-color:${block.color}"></span>`
}

function renderHotbar(): void {
  hotbar.innerHTML = inventory.slice(0, 8).map((id, index) => `
    <button class="hotbar-slot ${index === selectedIndex ? 'selected' : ''}" data-slot="${index}" aria-label="快捷栏 ${index + 1}${id ? `，${BLOCKS.find((item) => item.id === id)!.name}` : '，空'}" aria-pressed="${index === selectedIndex}">
      ${id ? swatch(id) : '<span class="empty-swatch">＋</span>'}<span class="slot-number">${index + 1}</span>
    </button>
  `).join('')
}

function renderCatalog(): void {
  const query = $<HTMLInputElement>('#item-search').value.trim().toLowerCase()
  const shown = BLOCKS.filter((item) => item.name.includes(query) || item.english.includes(query))
  catalog.innerHTML = shown.length ? shown.map((item) => `
    <button class="catalog-item ${item.id === catalogChoice ? 'active' : ''}" data-item="${item.id}">${swatch(item.id)}<span>${item.name}<small>${item.english}</small></span></button>
  `).join('') : '<p class="no-results">还没有这种材料，试试其他名称。</p>'
}

function renderInventory(): void {
  inventoryGrid.innerHTML = inventory.map((id, index) => `
    <button class="inventory-slot ${index < 8 ? 'quick-slot' : ''}" data-inventory-slot="${index}" aria-label="背包第 ${index + 1} 格${id ? `，${BLOCKS.find((item) => item.id === id)!.name}` : '，空'}">
      ${id ? swatch(id) : '<span class="slot-placeholder">·</span>'}<span class="inventory-number">${index + 1}</span>
    </button>
  `).join('')
}

function saveWorld(): void {
  const data: SaveData = {
    version: 1,
    edits: [...world.edits],
    inventory,
    player: { x: player.x, z: player.z, foot: player.foot, yaw: player.yaw, pitch: player.pitch },
    time: timeOfDay,
    day,
    mined,
  }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
  } catch {
    showToast('存储空间不足，当前修改可能无法保存')
  }
}

function showToast(message: string): void {
  const toast = $<HTMLDivElement>('#toast')
  toast.textContent = message
  toast.classList.add('visible')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2200)
}

function updateCamera(): void {
  camera.position.set(player.x, player.foot + 1.58, player.z)
  camera.rotation.set(player.pitch, player.yaw, 0)
}

const raycaster = new THREE.Raycaster()
raycaster.far = 6
const targetOutline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.015, 1.015, 1.015)),
  new THREE.LineBasicMaterial({ color: '#fff4cc', transparent: true, opacity: 0.95 }),
)
targetOutline.visible = false
scene.add(targetOutline)

type Target = { x: number; y: number; z: number; nx: number; ny: number; nz: number; id: BlockId }
let currentTarget: Target | null = null

function updateTarget(): void {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
  const hit = raycaster.intersectObject(world.mesh, false)[0]
  if (!hit?.face) {
    currentTarget = null
    targetOutline.visible = false
    targetLabel.textContent = '滑动屏幕，环顾四周'
    return
  }
  const { x: nx, y: ny, z: nz } = hit.face.normal
  const inside = hit.point.clone().addScaledVector(hit.face.normal, -0.01)
  const x = Math.floor(inside.x)
  const y = Math.floor(inside.y)
  const z = Math.floor(inside.z)
  const id = world.getBlock(x, y, z)
  if (!id) {
    currentTarget = null
    targetOutline.visible = false
    return
  }
  currentTarget = { x, y, z, nx: Math.round(nx), ny: Math.round(ny), nz: Math.round(nz), id }
  targetOutline.position.set(x + 0.5, y + 0.5, z + 0.5)
  targetOutline.visible = true
  targetLabel.textContent = `${BLOCKS.find((item) => item.id === id)!.name} · 可挖掘`
}

function mine(): void {
  if (!playing || panelOpen) return
  if (!currentTarget) return showToast('请先用准星对准方块')
  const { x, y, z, id } = currentTarget
  if (world.setBlock(x, y, z, null)) {
    mined++
    $('#mine-count').textContent = `已挖掘 ${mined} 块`
    showToast(`挖掉了${BLOCKS.find((item) => item.id === id)!.name}`)
    saveWorld()
    updateTarget()
  }
}

function place(): void {
  if (!playing || panelOpen) return
  if (!currentTarget) return showToast('请先用准星对准方块')
  const id = inventory[selectedIndex]
  if (!id) return showToast('选择一种材料后再放置')
  const { x, y, z, nx, ny, nz } = currentTarget
  const px = x + nx
  const py = y + ny
  const pz = z + nz
  if (Math.abs(px + 0.5 - player.x) < 0.82 && Math.abs(pz + 0.5 - player.z) < 0.82 && py < player.foot + 1.7 && py + 1 > player.foot) {
    return showToast('不能在自己站的位置放方块')
  }
  if (world.setBlock(px, py, pz, id)) {
    showToast(`放置了${BLOCKS.find((item) => item.id === id)!.name}`)
    saveWorld()
    updateTarget()
  } else showToast('这里无法放置方块')
}

function collides(x: number, z: number, foot: number): boolean {
  for (const dx of [-0.28, 0.28]) {
    for (const dz of [-0.28, 0.28]) {
      for (const dy of [0.15, 0.9, 1.5]) {
        if (world.getBlock(Math.floor(x + dx), Math.floor(foot + dy), Math.floor(z + dz))) return true
      }
    }
  }
  return false
}

function jump(): void {
  if (playing && !panelOpen && player.grounded) {
    player.velocityY = 6.3
    player.grounded = false
  }
}

const movement = { x: 0, y: 0 }
const keys = new Set<string>()

function movePlayer(dt: number): void {
  let side = movement.x + (keys.has('d') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('a') || keys.has('ArrowLeft') ? 1 : 0)
  let forward = -movement.y + (keys.has('w') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('s') || keys.has('ArrowDown') ? 1 : 0)
  const magnitude = Math.hypot(side, forward)
  if (magnitude > 1) { side /= magnitude; forward /= magnitude }
  const speed = 4.2 * dt
  const dx = (side * Math.cos(player.yaw) - forward * Math.sin(player.yaw)) * speed
  const dz = (-side * Math.sin(player.yaw) - forward * Math.cos(player.yaw)) * speed
  const nextX = Math.max(-world.radius + 0.35, Math.min(world.radius - 0.35, player.x + dx))
  const nextZ = Math.max(-world.radius + 0.35, Math.min(world.radius - 0.35, player.z + dz))
  if (!collides(nextX, player.z, player.foot)) player.x = nextX
  if (!collides(player.x, nextZ, player.foot)) player.z = nextZ

  player.velocityY -= 17 * dt
  let nextFoot = player.foot + player.velocityY * dt
  player.grounded = false
  if (player.velocityY <= 0) {
    for (let top = Math.floor(player.foot); top >= Math.ceil(nextFoot); top--) {
      let supported = false
      for (const ox of [-0.26, 0.26]) {
        for (const oz of [-0.26, 0.26]) {
          if (world.getBlock(Math.floor(player.x + ox), top - 1, Math.floor(player.z + oz))) supported = true
        }
      }
      if (supported) {
        nextFoot = top
        player.velocityY = 0
        player.grounded = true
        break
      }
    }
  } else if (collides(player.x, player.z, nextFoot)) {
    nextFoot = player.foot
    player.velocityY = 0
  }
  player.foot = nextFoot
  if (player.foot < -8) {
    player.x = 0.5
    player.z = 0.5
    player.foot = world.surfaceTop(0, 0)
    player.velocityY = 0
    showToast('你回到了起点')
  }
}

function openPanel(selector: string): void {
  panelOpen = true
  movement.x = 0
  movement.y = 0
  $('#joystick-knob').style.transform = ''
  $(selector).classList.remove('hidden')
  if (selector === '#inventory-panel') { renderCatalog(); renderInventory() }
  saveWorld()
}

function closePanels(): void {
  $('#inventory-panel').classList.add('hidden')
  $('#menu-panel').classList.add('hidden')
  panelOpen = false
}

renderHotbar()
$('#mine-count').textContent = `已挖掘 ${mined} 块`
hotbar.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-slot]')
  if (!button) return
  selectedIndex = Number(button.dataset.slot)
  renderHotbar()
})
catalog.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-item]')
  if (!button || !validBlock(button.dataset.item)) return
  catalogChoice = button.dataset.item
  renderCatalog()
})
inventoryGrid.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-inventory-slot]')
  if (!button) return
  const index = Number(button.dataset.inventorySlot)
  inventory[index] = catalogChoice
  renderInventory()
  renderHotbar()
  saveWorld()
})
$<HTMLInputElement>('#item-search').addEventListener('input', renderCatalog)
$('#start-button').addEventListener('click', () => {
  playing = true
  $('#welcome').classList.add('hidden')
  showToast('开始探索！对准方块试试挖掘')
})
$('#menu-button').addEventListener('click', () => openPanel('#menu-panel'))
$('#inventory-button').addEventListener('click', () => openPanel('#inventory-panel'))
$('#mine-button').addEventListener('click', mine)
$('#place-button').addEventListener('click', place)
$('#jump-button').addEventListener('click', jump)
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', closePanels))
$('#save-button').addEventListener('click', () => { saveWorld(); showToast('世界已保存'); closePanels() })
$('#reset-button').addEventListener('click', () => {
  if (window.confirm('要删除此浏览器中的世界存档并重新生成吗？')) {
    localStorage.removeItem(SAVE_KEY)
    window.location.reload()
  }
})

const joystick = $('#joystick')
const knob = $('#joystick-knob')
let joystickPointer: number | null = null
function updateJoystick(event: PointerEvent): void {
  const rect = joystick.getBoundingClientRect()
  const dx = event.clientX - (rect.left + rect.width / 2)
  const dy = event.clientY - (rect.top + rect.height / 2)
  const max = rect.width * 0.29
  const factor = Math.min(1, max / Math.max(1, Math.hypot(dx, dy)))
  const x = dx * factor
  const y = dy * factor
  movement.x = x / max
  movement.y = y / max
  knob.style.transform = `translate(${x}px, ${y}px)`
}
joystick.addEventListener('pointerdown', (event) => {
  if (!playing || panelOpen) return
  joystickPointer = event.pointerId
  joystick.setPointerCapture(event.pointerId)
  updateJoystick(event)
})
joystick.addEventListener('pointermove', (event) => {
  if (joystickPointer === event.pointerId) updateJoystick(event)
})
function releaseJoystick(event: PointerEvent): void {
  if (joystickPointer !== event.pointerId) return
  joystickPointer = null
  movement.x = 0
  movement.y = 0
  knob.style.transform = ''
}
joystick.addEventListener('pointerup', releaseJoystick)
joystick.addEventListener('pointercancel', releaseJoystick)

let lookPointer: number | null = null
let previousX = 0
let previousY = 0
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!playing || panelOpen || event.clientX < window.innerWidth * 0.28) return
  lookPointer = event.pointerId
  previousX = event.clientX
  previousY = event.clientY
  renderer.domElement.setPointerCapture(event.pointerId)
})
renderer.domElement.addEventListener('pointermove', (event) => {
  if (lookPointer !== event.pointerId) return
  player.yaw -= (event.clientX - previousX) * 0.0045
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - (event.clientY - previousY) * 0.0045))
  previousX = event.clientX
  previousY = event.clientY
})
function stopLook(event: PointerEvent): void {
  if (lookPointer === event.pointerId) lookPointer = null
}
renderer.domElement.addEventListener('pointerup', stopLook)
renderer.domElement.addEventListener('pointercancel', stopLook)

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  keys.add(key)
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) event.preventDefault()
  if (key === ' ') jump()
  if (key === 'q') mine()
  if (key === 'e') place()
  if (key === 'i' && playing) panelOpen ? closePanels() : openPanel('#inventory-panel')
  if (key >= '1' && key <= '8') { selectedIndex = Number(key) - 1; renderHotbar() }
})
window.addEventListener('keyup', (event) => keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key))
window.addEventListener('blur', () => keys.clear())
window.addEventListener('beforeunload', saveWorld)
document.addEventListener('visibilitychange', () => { if (document.hidden) saveWorld() })

function resize(): void {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.setSize(width, height)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

let lastFrame = performance.now()
let saveTimer = 0
let clockTimer = 0
function animate(now: number): void {
  requestAnimationFrame(animate)
  const dt = Math.min((now - lastFrame) / 1000, 0.05)
  lastFrame = now
  if (playing && !panelOpen) {
    movePlayer(dt)
    const nextTime = timeOfDay + dt / 480
    if (nextTime >= 1) day++
    timeOfDay = nextTime % 1
    saveTimer += dt
    if (saveTimer > 10) { saveTimer = 0; saveWorld() }
  }
  updateCamera()
  updateTarget()

  const daylight = Math.max(0, Math.sin(timeOfDay * Math.PI * 2))
  const lightMix = Math.max(0.12, daylight)
  const sky = nightSky.clone().lerp(daySky, lightMix)
  scene.background = sky
  if (scene.fog) scene.fog.color.copy(sky)
  ambient.intensity = 0.8 + daylight * 1.3
  sunlight.intensity = 0.25 + daylight * 1.85
  sunlight.position.set(Math.cos(timeOfDay * Math.PI * 2) * 30, Math.sin(timeOfDay * Math.PI * 2) * 28, -12)
  clouds.forEach((cloud, i) => { cloud.position.x += dt * (0.15 + i * 0.01); if (cloud.position.x > 45) cloud.position.x = -45 })
  clockTimer += dt
  if (clockTimer > 0.5) {
    clockTimer = 0
    const totalMinutes = Math.floor(((timeOfDay + 0.25) % 1) * 24 * 60)
    $('#clock').textContent = `${daylight > 0.12 ? '☀' : '☾'} 第 ${day} 天 · ${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
  }
  renderer.render(scene, camera)
}
requestAnimationFrame(animate)
