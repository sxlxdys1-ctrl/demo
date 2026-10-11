import * as THREE from 'three'
import { BLOCKS, registerCatalogBlock, registerCustomBlock, type BlockId, type Dimension, VoxelWorld } from './world'
import { EntityManager, makeMob, mobInfo, type Mob, type MobKind } from './entities'
import { OnlineClient, type OnlineFriend, type OnlineWorld, type WorkshopProduct } from './online'
import { addItem, allItems, canCraft, craft, countItem, emptyInventory, HOTBAR_SIZE, itemInfo, matchingRecipe, normalizeInventory, recipeFits, recipes, recipeNeeds, recipeSize, searchItems, takeItem, type Inventory, type ItemId } from './systems'
import catalogBlocks from './data/blocks.json'
import { iconUrl } from './icons'
import './style.css'

const SAVE_KEY = 'tiny-wonder-world-v2'
const OLD_SAVE_KEY = 'tiny-wonder-world-v1'
const blockItems: Record<BlockId, ItemId> = {
  grass: 'grass_block', dirt: 'dirt', stone: 'stone', wood: 'oak_log',
  leaves: 'oak_leaves', sand: 'sand', brick: 'bricks', glass: 'glass',
  netherrack: 'netherrack', nether_bricks: 'nether_bricks', blackstone: 'blackstone',
  soul_sand: 'soul_sand', end_stone: 'end_stone', obsidian: 'obsidian',
  stone_bricks: 'stone_bricks', end_portal_frame: 'end_portal_frame', purpur_block: 'purpur_block',
  crafting_table: 'crafting_table', fire: 'fire',
  painting_east: 'painting', painting_west: 'painting', painting_north: 'painting', painting_south: 'painting',
  item_frame_east: 'item_frame', item_frame_west: 'item_frame', item_frame_north: 'item_frame', item_frame_south: 'item_frame',
}
const placeableItems = Object.fromEntries(Object.entries(blockItems).map(([block, item]) => [item, block])) as Record<string, BlockId>
for (const id of catalogBlocks) {
  if (!allItems[id]) continue
  registerCatalogBlock(id, itemInfo(id).zh)
  blockItems[id] = id
  if (!placeableItems[id]) placeableItems[id] = id
}
type GameMode = 'survival' | 'creative' | 'adventure' | 'spectator' | 'hardcore'
const modeNames: Record<GameMode, string> = {
  survival: '生存', creative: '创造', adventure: '冒险', spectator: '旁观者', hardcore: '极限',
}
const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <div id="game" aria-label="方块小世界游戏画面"></div>
  <div class="grain" aria-hidden="true"></div>
  <header class="topbar">
    <div class="brand"><span class="brand-mark">✦</span><div><strong>超级好玩的小世界</strong><small>手机浏览器 · 探索先行版</small></div></div>
    <div class="top-actions"><button id="transform-button" class="icon-button" aria-label="生物变身">⚔</button><span id="clock" class="glass-pill">☀ 第 1 天 · 12:00</span><button id="menu-button" class="icon-button" aria-label="打开菜单">☰</button></div>
  </header>
  <div id="target-label" class="target-label">滑动屏幕，环顾四周</div>
  <div class="crosshair" aria-hidden="true"><i></i><i></i><b></b></div>
  <div id="damage-flash" class="damage-flash" aria-hidden="true"></div>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <div class="bottom-hud">
    <div class="status-line"><span id="mode-chip" class="mode-chip">♥ 生存</span><span id="health">♥ 40/40</span><span id="hunger">● 20/20</span><span id="experience">✦ 0</span><span id="mine-count">已挖掘 0 块</span></div>
    <div id="hotbar" class="hotbar" aria-label="快捷物品栏"></div>
  </div>
  <div id="joystick" class="joystick" aria-label="移动摇杆"><div id="joystick-knob" class="joystick-knob"><span>✦</span></div></div>
  <div class="movement-controls"><button id="sprint-button" class="round-action small-action" aria-label="切换疾跑" aria-pressed="false"><span class="action-icon">»</span><small>疾跑</small></button><button id="crouch-button" class="round-action small-action" aria-label="切换蹲下防坠落" aria-pressed="false"><span class="action-icon">⌄</span><small>蹲下</small></button></div>
  <div class="action-controls">
    <button id="inventory-button" class="round-action inventory-action" aria-label="打开背包"><span class="action-icon">▦</span><small>背包</small></button>
    <button id="jump-button" class="round-action jump-action" aria-label="跳跃"><span class="action-icon">↑</span><small>跳跃</small></button>
    <button id="mine-button" class="round-action mine-action" aria-label="挖掘或攻击"><span class="action-icon">⚒</span><small id="mine-label">挖掘</small></button>
    <button id="place-button" class="round-action place-action" aria-label="放置或使用"><span class="action-icon">▣</span><small id="place-label">放置</small></button>
    <button id="eat-button" class="round-action" aria-label="直接吃食物"><span class="action-icon">◕</span><small>吃东西</small></button>
    <button id="drop-button" class="round-action" aria-label="丢弃手中物品"><span class="action-icon">↘</span><small>丢弃</small></button>
  </div>
  <div id="welcome" class="overlay welcome-overlay">
    <div class="welcome-card">
      <div class="eyebrow">属于你的第一片方块天地</div>
      <div class="welcome-emblem">✦</div>
      <h1>超级好玩的<br><em>小世界</em></h1>
      <p>从一块草地开始，挖出你的灵感，搭起独一无二的小天地。</p>
      <div class="instruction-row"><span>◉ 左边摇杆移动</span><span>↔ 右边滑动视角</span></div>
      <button id="start-button" class="primary-button">进入我的世界 <span>→</span></button>
      <button id="welcome-skin-button" class="menu-option">制作皮肤 <span>✎</span></button>
      <small class="welcome-note">进度保存在此浏览器中 · 建议横屏探索</small>
    </div>
  </div>
  <div id="inventory-panel" class="overlay panel-overlay hidden" role="dialog" aria-modal="true" aria-label="背包">
    <div class="panel inventory-panel">
      <div class="panel-heading"><div><div class="eyebrow">你的方块收藏</div><h2>背包 <span>400 格</span></h2></div><button class="close-button" data-close aria-label="关闭背包">×</button></div>
      <p id="inventory-hint" class="panel-hint">点击两个格子交换物品。前 10 格显示在底部快捷栏。</p>
      <input id="item-search" class="search-input" type="search" placeholder="搜索材料名称 / English" aria-label="搜索材料" />
      <div id="catalog" class="catalog"></div>
      <div class="grid-label">我的背包 <span>点击格子放入选中的材料</span></div>
      <div class="inventory-tools"><button id="inventory-drop-one" class="menu-option">丢弃选中格 1 个</button><button id="inventory-drop-stack" class="menu-option">丢弃选中整组</button></div>
      <div id="inventory-grid" class="inventory-grid"></div>
    </div>
  </div>
  <div id="menu-panel" class="overlay panel-overlay hidden" role="dialog" aria-modal="true" aria-label="游戏菜单">
    <div class="panel menu-panel">
      <div class="panel-heading"><div><div class="eyebrow">休息一下</div><h2>游戏菜单</h2></div><button class="close-button" data-close aria-label="关闭菜单">×</button></div>
      <p class="panel-hint">左侧摇杆移动；在右侧空白处滑动可转动视角。准星对准方块后点击挖掘或放置。</p>
      <button id="craft-button" class="menu-option">工作台与合成 <span>▦</span></button>
      <button id="journey-button" class="menu-option">世界旅程 <span>✦</span></button>
      <button id="mode-button" class="menu-option">游戏模式 <span id="mode-label">生存</span></button>
      <button id="camera-button" class="menu-option">切换视角 <span id="camera-label">第一人称</span></button>
      <button id="command-button" class="menu-option">中文指令 <span>输入</span></button>
      <button id="flight-button" class="menu-option">飞行 <span id="flight-label">关闭</span></button>
      <button id="coins-button" class="menu-option">金币（点击 ＋ 免费增加） <span id="coins-label">0 ＋</span></button>
      <button id="skin-button" class="menu-option">制作皮肤与物品商店 <span>✎</span></button>
      <button id="emote-button" class="menu-option">28 种免费动作 <span>♫</span></button>
      <button id="workshop-button" class="menu-option">沙盒工坊与模组 <span>✣</span></button>
      <button id="lobby-button" class="menu-option">小游戏大厅 <span>▣</span></button>
      <button id="online-button" class="menu-option">好友联机与共享工坊 <span>☷</span></button>
      <button id="save-button" class="menu-option">保存当前世界 <span>↗</span></button>
      <button id="reset-button" class="menu-option danger-option">重新生成世界 <span>↻</span></button>
      <button class="primary-button menu-resume" data-close>继续探索 <span>→</span></button>
    </div>
  </div>
  <div id="craft-panel" class="overlay panel-overlay hidden" role="dialog" aria-modal="true" aria-label="工作台与合成">
    <div class="panel craft-panel">
      <div class="panel-heading"><div><div class="eyebrow">制作新的东西</div><h2>工作台 <span id="bench-label">9 格</span></h2></div><button class="close-button" data-close aria-label="关闭工作台">×</button></div>
      <p class="panel-hint">点击材料，再点击格子摆放；四块同种木板可合成工作台。搜索中文或英文配方。</p>
      <div class="bench-controls"><button id="craft-mode" class="menu-option">切换到 3×3 工作台</button><button id="bench-less" class="menu-option">减少 9 格</button><button id="bench-more" class="menu-option">增加 9 格</button></div>
      <div id="craft-materials" class="craft-materials"></div>
      <div class="craft-workspace"><div id="craft-grid" class="craft-grid"></div><div class="craft-result"><span id="craft-result-label">选择材料填入格子</span><button id="craft-grid-make" class="primary-button" disabled>合成</button><button id="craft-grid-clear" class="menu-option">清空格子</button></div></div>
      <input id="recipe-search" class="search-input" type="search" placeholder="搜索合成物品 / English" aria-label="搜索合成物品" />
      <div id="recipe-list" class="recipe-list"></div>
    </div>
  </div>
  <div id="mob-panel" class="overlay panel-overlay hidden" role="dialog" aria-modal="true" aria-label="生物变身">
    <div class="panel menu-panel">
      <div class="panel-heading"><div><div class="eyebrow">选择想成为的生物或物品</div><h2>自由变身</h2></div><button class="close-button" data-close aria-label="关闭生物收藏">×</button></div>
      <div id="mob-list" class="mob-list"></div>
      <input id="morph-search" class="search-input" type="search" placeholder="搜索任意物品或生物蛋 / English" aria-label="搜索变身目标" />
      <div id="morph-items" class="catalog"></div>
    </div>
  </div>
  <div id="journey-panel" class="overlay panel-overlay hidden" role="dialog" aria-modal="true" aria-label="世界旅程">
    <div class="panel menu-panel">
      <div class="panel-heading"><div><div class="eyebrow">下界 · 要塞 · 末地</div><h2>世界旅程</h2></div><button class="close-button" data-close aria-label="关闭世界旅程">×</button></div>
      <p id="journey-status" class="panel-hint"></p>
      <div id="journey-actions"></div>
    </div>
  </div>
  <div id="skin-panel" class="overlay panel-overlay hidden" role="dialog" aria-modal="true" aria-label="皮肤制作与商店">
    <div class="panel menu-panel">
      <div class="panel-heading"><div><div class="eyebrow">设计你的外观</div><h2>皮肤工坊</h2></div><button class="close-button" data-close aria-label="关闭皮肤工坊">×</button></div>
      <p class="panel-hint">选择颜色，在 8×8 画布上涂画。皮肤只在当前浏览器保存。</p>
      <label class="form-label">画笔颜色 <input id="skin-color" type="color" value="#71a7bd" /></label>
      <div id="skin-grid" class="skin-grid"></div>
      <label class="form-label">外形 <select id="skin-shape"><option value="normal">人物</option><option value="item">物品</option><option value="air">空气</option></select></label>
      <button id="skin-save" class="primary-button">保存我的皮肤</button>
      <div id="skin-shop"></div>
      <div id="item-shop"></div>
    </div>
  </div>
  <div id="emote-panel" class="overlay panel-overlay hidden" role="dialog" aria-modal="true" aria-label="免费动作">
    <div class="panel menu-panel"><div class="panel-heading"><h2>28 种免费动作</h2><button class="close-button" data-close aria-label="关闭动作">×</button></div><div id="emote-list" class="emote-list"></div></div>
  </div>
  <div id="workshop-panel" class="overlay panel-overlay hidden" role="dialog" aria-modal="true" aria-label="沙盒工坊">
    <div class="panel menu-panel">
      <div class="panel-heading"><h2>沙盒工坊</h2><button class="close-button" data-close aria-label="关闭工坊">×</button></div>
      <p class="panel-hint">制作自己的彩色方块模组；当前收藏保存在本机，联网分享将在服务器接通后开放。</p>
      <input id="mod-name" class="search-input" maxlength="24" placeholder="新模组名称" aria-label="新模组名称" />
      <label class="form-label">方块颜色 <input id="mod-color" type="color" value="#bd86ce" /></label>
      <button id="mod-create" class="primary-button">创建我的方块模组</button>
      <input id="mod-search" class="search-input" type="search" placeholder="搜索模组" aria-label="搜索模组" />
      <div id="mod-list"></div>
    </div>
  </div>
  <div id="lobby-panel" class="overlay panel-overlay hidden" role="dialog" aria-modal="true" aria-label="小游戏大厅">
    <div class="panel menu-panel"><div class="panel-heading"><h2>小游戏大厅</h2><button class="close-button" data-close aria-label="关闭大厅">×</button></div><p id="mini-status" class="panel-hint">选择一个小游戏房间开始挑战。</p><div id="mini-rooms"></div></div>
  </div>
  <div id="online-panel" class="overlay panel-overlay hidden" role="dialog" aria-modal="true" aria-label="好友联机与共享工坊">
    <div class="panel online-panel">
      <div class="panel-heading"><div><div class="eyebrow">和朋友一起建造</div><h2>好友联机</h2></div><button class="close-button" data-close aria-label="关闭联机面板">×</button></div>
      <div id="online-content"></div>
    </div>
  </div>
  <div id="command-panel" class="overlay panel-overlay hidden" role="dialog" aria-modal="true" aria-label="中文指令">
    <div class="panel menu-panel"><div class="panel-heading"><h2>中文指令</h2><button class="close-button" data-close aria-label="关闭指令">×</button></div>
      <p class="panel-hint">例如：调到白天、调到晚上、给我 64 个钻石、切换创造模式、传送到主世界、恢复生命。</p>
      <input id="command-input" class="search-input" maxlength="80" placeholder="输入中文指令" aria-label="中文指令" />
      <button id="command-run" class="primary-button">执行指令</button>
      <p id="command-status" class="panel-hint" role="status"></p>
    </div>
  </div>
  <div id="landscape-hint" class="landscape-hint hidden">请将手机横过来，获得完整的游戏画面</div>
`

const world = new VoxelWorld()
const scene = new THREE.Scene()
const daySky = new THREE.Color('#9bd6e7')
const nightSky = new THREE.Color('#122543')
const skyCanvas = document.createElement('canvas')
skyCanvas.width = 512
skyCanvas.height = 256
const skyContext = skyCanvas.getContext('2d')!
const skyTexture = new THREE.CanvasTexture(skyCanvas)
skyTexture.colorSpace = THREE.SRGBColorSpace
scene.background = skyTexture
scene.fog = new THREE.Fog(daySky.clone(), 22, 74)
scene.add(world.mesh)
const entities = new EntityManager(scene, world)

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
sea.visible = world.dimension === 'overworld'
scene.add(sea)

const sun = new THREE.Mesh(new THREE.SphereGeometry(3.5, 16, 12), new THREE.MeshBasicMaterial({ color: '#fff3c6' }))
const moon = new THREE.Mesh(new THREE.SphereGeometry(2.3, 16, 12), new THREE.MeshBasicMaterial({ color: '#e7efff' }))
scene.add(sun, moon)

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
  version: 2
  edits: [string, BlockId | null][]
  inventory: Inventory
  player: { x: number; z: number; foot: number; yaw: number; pitch: number }
  time: number
  day: number
  mined: number
  mode: GameMode
  health: number
  hunger: number
  experience: number
  benchSize: number
  unlockedMobs: MobKind[]
  transform: MobKind | null
  itemForm?: ItemId | null
  drops?: { id: ItemId; count: number; x: number; z: number; dimension: Dimension }[]
  dimension: Dimension
  editsByDimension: Partial<Record<Dimension, [string, BlockId | null][]>>
  strongholdLocated: boolean
  dragonDefeated: boolean
  coins: number
  skinPixels: string[]
  skinShape: 'normal' | 'item' | 'air'
  ownedSkins: string[]
  customMods: { id: string; name: string; color: string }[]
  ownedMods: string[]
  activeMiniGame: string | null
  miniProgress: number
}

function readSave(): SaveData | null {
  try {
    const current = localStorage.getItem(SAVE_KEY)
    const data: unknown = JSON.parse(current || localStorage.getItem(OLD_SAVE_KEY) || 'null')
    if (!data || typeof data !== 'object' || !('version' in data) || ![1, 2].includes(Number(data.version))) return null
    const save = data as SaveData
    if (!Array.isArray(save.edits) || !Array.isArray(save.inventory)) return null
    if (!save.player || ![save.player.x, save.player.z, save.player.foot, save.player.yaw, save.player.pitch].every(Number.isFinite)) return null
    const validMods = Array.isArray(save.customMods) ? save.customMods.filter((mod): mod is { id: string; name: string; color: string } =>
      !!mod && /^custom_[a-z0-9_]{1,36}$/.test(mod.id) && typeof mod.name === 'string' && /^#[0-9a-fA-F]{6}$/.test(mod.color)).slice(0, 100) : []
    for (const mod of validMods) allItems[mod.id] = { zh: mod.name, en: mod.name, stack: 64 }
    return {
      ...save,
      version: 2,
      inventory: normalizeInventory(save.inventory.map((slot) => typeof slot === 'string' ? blockItems[slot as BlockId] ?? slot : slot)),
      mode: save.version === 2 && save.mode in modeNames ? save.mode : 'creative',
      health: Number.isFinite(save.health) ? Math.max(0, Math.min(save.transform && save.transform in mobInfo ? mobInfo[save.transform].health : 40, save.health)) : 40,
      hunger: Number.isFinite(save.hunger) ? Math.max(0, Math.min(20, save.hunger)) : 20,
      experience: Number.isFinite(save.experience) ? Math.max(0, save.experience) : 0,
      benchSize: Number.isInteger(save.benchSize) ? Math.max(9, Math.min(3000, save.benchSize)) : 9,
      unlockedMobs: Array.isArray(save.unlockedMobs) ? save.unlockedMobs.filter((id): id is MobKind => id in mobInfo) : [],
      transform: save.transform && save.transform in mobInfo ? save.transform : null,
      itemForm: typeof save.itemForm === 'string' && allItems[save.itemForm] ? save.itemForm : null,
      drops: Array.isArray(save.drops) ? save.drops.filter((drop) => drop && typeof drop.id === 'string' && allItems[drop.id] &&
        Number.isInteger(drop.count) && drop.count > 0 && drop.count <= itemInfo(drop.id).stack &&
        Number.isFinite(drop.x) && Number.isFinite(drop.z) && Math.abs(drop.x) < 20 && Math.abs(drop.z) < 20 &&
        ['overworld', 'nether', 'end', 'end_city'].includes(drop.dimension)).slice(0, 100) : [],
      dimension: ['overworld', 'nether', 'end', 'end_city'].includes(save.dimension) ? save.dimension : 'overworld',
      editsByDimension: save.editsByDimension && typeof save.editsByDimension === 'object' ? save.editsByDimension : { overworld: save.edits },
      strongholdLocated: !!save.strongholdLocated,
      dragonDefeated: !!save.dragonDefeated,
      coins: Number.isSafeInteger(save.coins) ? Math.max(0, save.coins) : 0,
      skinPixels: Array.isArray(save.skinPixels) && save.skinPixels.length === 64
        ? save.skinPixels.map((color) => typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#71a7bd')
        : Array(64).fill('#71a7bd'),
      skinShape: ['normal', 'item', 'air'].includes(save.skinShape) ? save.skinShape : 'normal',
      ownedSkins: Array.isArray(save.ownedSkins) ? save.ownedSkins.filter((id): id is string => typeof id === 'string' && id.length < 30) : [],
      customMods: validMods,
      ownedMods: Array.isArray(save.ownedMods) ? save.ownedMods.filter((id): id is string => typeof id === 'string' && ['shader', 'realistic', 'double_loot', 'excavator'].includes(id)) : [],
      activeMiniGame: typeof save.activeMiniGame === 'string' && ['mining', 'treasure', 'parkour'].includes(save.activeMiniGame) ? save.activeMiniGame : null,
      miniProgress: Number.isFinite(save.miniProgress) ? Math.max(0, save.miniProgress) : 0,
    }
  } catch {
    return null
  }
}

const saved = readSave()
for (const mod of saved?.customMods ?? []) {
  if (registerCustomBlock(mod.id, mod.name, mod.color)) {
    allItems[mod.id] = { zh: mod.name, en: mod.name, stack: 64 }
    blockItems[mod.id] = mod.id
    placeableItems[mod.id] = mod.id
  }
}
if (saved) world.setDimension(saved.dimension, saved.editsByDimension[saved.dimension] ?? saved.edits)
else world.rebuild()
if (saved && saved.dimension !== 'overworld') entities.removeAll()

const player = {
  x: saved?.player.x ?? 0.5,
  z: saved?.player.z ?? 0.5,
  foot: saved?.player.foot ?? 4,
  yaw: saved?.player.yaw ?? 0,
  pitch: saved?.player.pitch ?? -0.33,
  velocityY: 0,
  grounded: false,
}
let thirdPerson = false
let flying = false
let flyRise = false
const avatar = new THREE.Group()
const avatarMaterial = new THREE.MeshLambertMaterial({ color: '#71a7bd' })
for (const [width, height, depth, x, y, z] of [
  [0.54, 0.8, 0.3, 0, 1.05, 0], [0.46, 0.46, 0.43, 0, 1.68, 0],
  [0.16, 0.73, 0.21, -0.38, 1.05, 0], [0.16, 0.73, 0.21, 0.38, 1.05, 0],
  [0.18, 0.7, 0.23, -0.15, 0.35, 0], [0.18, 0.7, 0.23, 0.15, 0.35, 0],
]) {
  const part = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), avatarMaterial)
  part.position.set(x, y, z)
  avatar.add(part)
}
scene.add(avatar)
const formGroup = new THREE.Group()
scene.add(formGroup)
if (Math.abs(player.x) > world.radius || Math.abs(player.z) > world.radius || player.foot < -2) {
  player.x = 0.5
  player.z = 0.5
  player.foot = 4
}

const validBlock = (value: unknown): value is BlockId => BLOCKS.some((block) => block.id === value)
const inventory: Inventory = saved?.inventory ?? emptyInventory()
if (!saved) inventory[0] = { id: 'oak_log', count: 1 }

let selectedIndex = 0
let catalogChoice: ItemId = 'grass_block'
let inventorySelection: number | null = null
const DAY_DURATION = 360
const NIGHT_DURATION = 420
const DAY_END = DAY_DURATION / (DAY_DURATION + NIGHT_DURATION)
let timeOfDay = Number.isFinite(saved?.time) ? saved!.time % 1 : 0.25
let day = Number.isFinite(saved?.day) ? Math.max(1, Math.floor(saved!.day)) : 1
let mined = Number.isFinite(saved?.mined) ? saved!.mined : 0
let mode: GameMode = saved?.mode ?? 'survival'
let health = saved?.health ?? 40
let hunger = saved?.hunger ?? 20
let experience = saved?.experience ?? 0
let benchSize = saved?.benchSize ?? 9
let usingWorkbench = false
let craftChoice: ItemId | null = null
let craftGrid: (ItemId | null)[] = Array(4).fill(null)
let sleeping = false
let cameraMode: 0 | 1 | 2 = 0
const unlockedMobs = new Set<MobKind>(saved?.unlockedMobs ?? [])
let transform = saved?.transform ?? null
let itemForm = saved?.itemForm ?? null
let sprinting = false
let crouching = false
const editsByDimension: Partial<Record<Dimension, [string, BlockId | null][]>> = saved?.editsByDimension ?? {}
let strongholdLocated = saved?.strongholdLocated ?? false
let dragonDefeated = saved?.dragonDefeated ?? false
let coins = saved?.coins ?? 0
let skinPixels = saved?.skinPixels ?? Array(64).fill('#71a7bd') as string[]
let skinShape: 'normal' | 'item' | 'air' = saved?.skinShape ?? 'normal'
const ownedSkins = new Set(saved?.ownedSkins ?? [])
const customMods = [...(saved?.customMods ?? [])]
const ownedMods = new Set(saved?.ownedMods ?? [])
let activeMiniGame = saved?.activeMiniGame ?? null
let miniProgress = saved?.miniProgress ?? 0
const online = new OnlineClient()
let onlineReady = false
let onlineWorldId: string | null = null
let sharedEdits: Partial<Record<Dimension, [string, BlockId | null][]>> = {}
let localSnapshot: {
  dimension: Dimension
  edits: Partial<Record<Dimension, [string, BlockId | null][]>>
  player: { x: number; z: number; foot: number; yaw: number; pitch: number }
} | null = null
const remoteAvatars = new Map<string, THREE.Group>()
const sharedProducts = new Map<string, WorkshopProduct>()
type DroppedItem = { id: ItemId; count: number; x: number; z: number; dimension: Dimension; mesh: THREE.Mesh; pickupAfter: number }
const droppedItems: DroppedItem[] = []
if (saved && saved.dimension !== 'overworld') {
  if (saved.dimension === 'nether') {
    entities.spawn('blaze', 9, 9)
    entities.spawn('piglin', -9, -7)
  } else if (saved.dimension === 'end' && !dragonDefeated) entities.spawn('ender_dragon', 10, 0)
  else if (saved.dimension === 'end_city') entities.spawn('enderman', 7, 8)
}
let playing = false
let panelOpen = false
let toastTimer = 0

const $ = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector)!
const hotbar = $<HTMLDivElement>('#hotbar')
const catalog = $<HTMLDivElement>('#catalog')
const inventoryGrid = $<HTMLDivElement>('#inventory-grid')
const targetLabel = $<HTMLDivElement>('#target-label')

function swatch(id: ItemId): string {
  const block = BLOCKS.find((item) => blockItems[item.id] === id)
  return `<span class="block-swatch" style="background-image:url(${iconUrl(id, block?.color)})"></span>`
}

function updateFormAppearance(): void {
  formGroup.clear()
  if (transform) formGroup.add(makeMob(transform))
  else if (itemForm) {
    const name = itemForm.endsWith('_spawn_egg')
    const hue = [...itemForm].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 360
    const material = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue / 360, 0.48, 0.62) })
    if (name) {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 1), material)
      body.position.y = 0.75
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.56, 0.5), material)
      head.position.set(0, 1.28, -0.47)
      formGroup.add(body, head)
    } else {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.75), material)
      mesh.position.y = 0.45
      formGroup.add(mesh)
    }
  }
  if (transform || itemForm) { thirdPerson = true; if (cameraMode === 0) cameraMode = 1 }
  updateStatus()
}

function spawnDroppedItem(id: ItemId, count: number, x: number, z: number, dimension: Dimension, delay = 1800): void {
  if (droppedItems.length >= 100) return
  const color = new THREE.Color().setHSL([...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360 / 360, 0.45, 0.64)
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), new THREE.MeshLambertMaterial({ color }))
  scene.add(mesh)
  droppedItems.push({ id, count, x, z, dimension, mesh, pickupAfter: performance.now() + delay })
}

for (const drop of saved?.drops ?? []) spawnDroppedItem(drop.id, drop.count, drop.x, drop.z, drop.dimension, 800)
updateFormAppearance()

function renderHotbar(): void {
  hotbar.innerHTML = inventory.slice(0, HOTBAR_SIZE).map((slot, index) => `
    <button class="hotbar-slot ${index === selectedIndex ? 'selected' : ''}" data-slot="${index}" aria-label="快捷栏 ${index + 1}${slot ? `，${itemInfo(slot.id).zh} ${slot.count} 个` : '，空'}" aria-pressed="${index === selectedIndex}">
      ${slot ? swatch(slot.id) : '<span class="empty-swatch">＋</span>'}<span class="slot-number">${slot?.count ?? index + 1}</span>
    </button>
  `).join('')
  const held = inventory[selectedIndex]?.id
  $('#place-label').textContent = held?.endsWith('_bed') || ['chicken', 'cooked_chicken', 'mutton', 'cooked_mutton', 'beef', 'cooked_beef', 'porkchop', 'cooked_porkchop', 'bread', 'apple'].includes(held ?? '') ? '使用' : '放置'
}

function renderCatalog(): void {
  const query = $<HTMLInputElement>('#item-search').value
  const shown = searchItems(query)
  catalog.innerHTML = shown.length ? shown.map((id) => `
    <button class="catalog-item ${id === catalogChoice ? 'active' : ''}" data-item="${id}">${swatch(id)}<span>${itemInfo(id).zh}<small>${itemInfo(id).en}</small></span></button>
  `).join('') : '<p class="no-results">还没有这种材料，试试其他名称。</p>'
  $<HTMLParagraphElement>('#inventory-hint').textContent = mode === 'creative'
    ? '创造模式：先选材料，再点格子取出一组。前 10 格是快捷栏。'
    : '生存模式：点击两个格子交换物品。挖掘得到材料，工作台可以合成。'
}

function renderInventory(): void {
  inventoryGrid.innerHTML = inventory.map((slot, index) => `
    <button class="inventory-slot ${index < HOTBAR_SIZE ? 'quick-slot' : ''} ${inventorySelection === index ? 'selected' : ''}" data-inventory-slot="${index}" aria-label="背包第 ${index + 1} 格${slot ? `，${itemInfo(slot.id).zh} ${slot.count} 个` : '，空'}">
      ${slot ? swatch(slot.id) : '<span class="slot-placeholder">·</span>'}<span class="inventory-number">${slot?.count ?? index + 1}</span>
    </button>
  `).join('')
}

function updateStatus(): void {
  $('#mode-chip').textContent = `✦ ${modeNames[mode]}`
  $('#mode-label').textContent = modeNames[mode]
  $('#health').textContent = `♥ ${Math.ceil(health)}/${transform ? mobInfo[transform].health : 40}`
  $('#hunger').textContent = `● ${Math.ceil(hunger)}/20`
  $('#experience').textContent = `✦ ${Math.floor(experience)}`
  $('#bench-label').textContent = usingWorkbench ? `${benchSize} 格` : '随身 2×2'
  $('#bench-label').classList.toggle('rainbow', benchSize === 3000)
  $('#camera-label').textContent = ['第一人称', '第三人称', '前置视角'][cameraMode]
  $('#flight-label').textContent = flying || mode === 'spectator' ? '开启' : '关闭'
  $('#coins-label').textContent = `${coins} ＋`
}

function workbenchNearby(): boolean {
  if (mode === 'creative') return true
  for (let x = Math.floor(player.x) - 4; x <= Math.floor(player.x) + 4; x++) {
    for (let z = Math.floor(player.z) - 4; z <= Math.floor(player.z) + 4; z++) {
      if (Math.hypot(x + 0.5 - player.x, z + 0.5 - player.z) > 4.5) continue
      for (let y = Math.floor(player.foot) - 2; y <= Math.floor(player.foot) + 2; y++) {
        if (world.getBlock(x, y, z) === 'crafting_table') return true
      }
    }
  }
  return false
}

function craftCapacity(): number { return usingWorkbench && workbenchNearby() ? benchSize : 4 }

function renderCraftGrid(): void {
  if (usingWorkbench && !workbenchNearby()) usingWorkbench = false
  const width = usingWorkbench ? 3 : 2
  if (craftGrid.length !== width * width) craftGrid = Array(width * width).fill(null)
  const supplies = inventory.filter((slot, index, all) => slot && all.findIndex((other) => other?.id === slot.id) === index)
    .map((slot) => slot!)
  $('#craft-materials').innerHTML = supplies.map((slot) => `<button class="craft-material ${craftChoice === slot.id ? 'selected' : ''}" data-craft-material="${slot.id}">${swatch(slot.id)}<span>${itemInfo(slot.id).zh}<small>×${countItem(inventory, slot.id)}</small></span></button>`).join('') || '<span class="panel-hint">先挖木头，随身合成木板。</span>'
  $('#craft-grid').className = `craft-grid width-${width}`
  $('#craft-grid').innerHTML = craftGrid.map((id, index) => `<button class="craft-cell" data-craft-cell="${index}" aria-label="合成格 ${index + 1}${id ? ` ${itemInfo(id).zh}` : ' 空'}">${id ? swatch(id) : '<span>＋</span>'}</button>`).join('')
  const match = matchingRecipe(craftGrid, width)
  $('#craft-result-label').textContent = match ? `${itemInfo(match.result).zh} ×${match.count}` : '配方未匹配'
  $<HTMLButtonElement>('#craft-grid-make').disabled = !match || !canCraft(inventory, match, craftCapacity())
  $('#craft-mode').textContent = usingWorkbench ? '切换到随身 2×2' : '切换到 3×3 工作台'
  $<HTMLButtonElement>('#craft-mode').disabled = !usingWorkbench && !workbenchNearby()
  $('#bench-less').classList.toggle('hidden', !usingWorkbench)
  $('#bench-more').classList.toggle('hidden', !usingWorkbench)
  updateStatus()
}

function renderRecipes(): void {
  const query = $<HTMLInputElement>('#recipe-search').value.trim().toLowerCase()
  const chosen = recipes.filter((recipe) => {
    const info = itemInfo(recipe.result)
    return !query || info.zh.includes(query) || info.en.toLowerCase().includes(query) || recipe.result.includes(query)
  })
  const featured = ['oak_planks', 'crafting_table', 'stick', 'white_bed', 'flint_and_steel']
    .map((id) => recipes.find((recipe) => recipe.result === id && (!recipe.shape || recipe.shape.flat().includes('oak_planks'))))
    .filter((recipe): recipe is NonNullable<typeof recipe> => !!recipe)
  const shown = (query ? chosen : [...featured, ...chosen.slice(-25)]).slice(0, 60)
  $('#recipe-list').innerHTML = shown.length ? shown.map((recipe) => {
    const index = recipes.indexOf(recipe)
    const needs = [...recipeNeeds(recipe)].map(([id, count]) => `${itemInfo(id).zh}×${count}`).join('、')
    const capacity = recipeFits(recipe, usingWorkbench ? 3 : 2) || usingWorkbench && recipeSize(recipe) <= benchSize
    const possible = capacity && canCraft(inventory, recipe, craftCapacity())
    return `<div class="recipe-card"><div>${swatch(recipe.result)}<strong>${itemInfo(recipe.result).zh} ×${recipe.count}</strong><small>${needs}</small></div><button data-craft="${index}" ${possible ? '' : 'disabled'}>${possible ? recipeFits(recipe, usingWorkbench ? 3 : 2) ? '填入格子' : '合成' : capacity ? '材料不足' : '需要工作台'}</button></div>`
  }).join('') : '<p class="no-results">没有找到这个配方。</p>'
}

function saveWorld(): void {
  const activeEdits = localSnapshot ? localSnapshot.edits : { ...editsByDimension, [world.dimension]: [...world.edits] }
  const data: SaveData = {
    version: 2,
    edits: activeEdits.overworld ?? [],
    inventory,
    player: localSnapshot?.player ?? { x: player.x, z: player.z, foot: player.foot, yaw: player.yaw, pitch: player.pitch },
    time: timeOfDay,
    day,
    mined,
    mode,
    health,
    hunger,
    experience,
    benchSize,
    unlockedMobs: [...unlockedMobs],
    transform,
    itemForm,
    drops: droppedItems.map(({ id, count, x, z, dimension }) => ({ id, count, x, z, dimension })),
    dimension: localSnapshot?.dimension ?? world.dimension,
    editsByDimension: activeEdits,
    strongholdLocated,
    dragonDefeated,
    coins,
    skinPixels,
    skinShape,
    ownedSkins: [...ownedSkins],
    customMods,
    ownedMods: [...ownedMods],
    activeMiniGame,
    miniProgress,
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
  avatar.position.set(player.x, player.foot, player.z)
  formGroup.position.set(player.x, player.foot - (crouching ? 0.25 : 0), player.z)
  formGroup.rotation.y = player.yaw
  formGroup.visible = thirdPerson && !!(transform || itemForm)
  avatar.rotation.y = player.yaw
  avatar.rotation.z = emoteUntil > performance.now() ? Math.sin(performance.now() * 0.004 * (1 + emoteIndex % 4)) * (0.12 + emoteIndex % 5 * 0.05) : 0
  avatar.rotation.x = emoteUntil > performance.now() ? Math.cos(performance.now() * 0.003 * (1 + emoteIndex % 3)) * (0.08 + emoteIndex % 7 * 0.035) : 0
  avatar.visible = thirdPerson && !transform && !itemForm && skinShape !== 'air'
  if (cameraMode === 2) {
    camera.position.set(player.x - Math.sin(player.yaw) * 3.5, player.foot + (crouching ? 1.4 : 1.85), player.z - Math.cos(player.yaw) * 3.5)
    camera.lookAt(player.x, player.foot + 1.1, player.z)
  } else if (thirdPerson) {
    camera.position.set(
      player.x + Math.sin(player.yaw) * 3.5,
      player.foot + (crouching ? 2.05 : 2.5) + Math.sin(player.pitch) * 1.1,
      player.z + Math.cos(player.yaw) * 3.5,
    )
    camera.rotation.set(player.pitch, player.yaw, 0)
  } else {
    camera.position.set(player.x, player.foot + (crouching ? 1.16 : 1.58), player.z)
    camera.rotation.set(player.pitch, player.yaw, 0)
  }
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
let currentMob: Mob | null = null

function updateTarget(): void {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
  const hit = raycaster.intersectObject(world.mesh, false)[0]
  const mob = entities.target(camera)
  if (mob && (!hit || camera.position.distanceTo(mob.group.position) < hit.distance + 1)) {
    currentMob = mob
    currentTarget = null
    targetOutline.visible = false
    targetLabel.textContent = `${mobInfo[mob.kind].name} · ♥ ${Math.ceil(mob.health)}`
    $('#mine-label').textContent = '攻击'
    return
  }
  currentMob = null
  $('#mine-label').textContent = '挖掘'
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

function renderMobs(): void {
  const kinds = Object.keys(mobInfo) as MobKind[]
  $('#mob-list').innerHTML = `<button class="menu-option" data-transform="none">恢复玩家形态</button>` + kinds.map((kind) => {
    return `<div class="menu-option">${mobInfo[kind].name}<span><button data-transform="${kind}">${transform === kind ? '当前形态' : '变身'}</button>${onlineWorldId && unlockedMobs.has(kind) ? `<button data-spawn="${kind}">放置生物</button>` : ''}</span></div>`
  }).join('')
  renderMorphItems()
}

function renderMorphItems(): void {
  const query = $<HTMLInputElement>('#morph-search').value.trim()
  const ids = query ? searchItems(query, 80) : Object.keys(allItems).filter((id) => id.endsWith('_spawn_egg')).slice(0, 32)
  $('#morph-items').innerHTML = ids.map((id) => `<button class="catalog-item" data-item-morph="${id}">${swatch(id)}<span>${itemInfo(id).zh}<small>${itemInfo(id).en}</small></span></button>`).join('') || '<p class="no-results">没有找到这个形态。</p>'
}

function renderJourney(): void {
  const names: Record<Dimension, string> = { overworld: '主世界', nether: '下界', end: '末地', end_city: '末地城' }
  $('#journey-status').textContent = `当前位置：${names[world.dimension]}。${strongholdLocated ? '已找到要塞。' : '末影之眼可以指引你找到要塞。'}${dragonDefeated ? '已击败末影龙。' : ''}`
  const actions: [string, string][] = world.dimension === 'overworld'
    ? [['nether', '进入下界'], ['locate', '投掷末影之眼，寻找要塞'], ['end', '激活要塞传送门，进入末地'], ...(dragonDefeated ? [['end_city', '通过祭坛前往末地城'] as [string, string]] : [])]
    : world.dimension === 'nether'
      ? [['trade', '用金锭与猪灵交换末影珍珠'], ['overworld', '返回主世界']]
      : world.dimension === 'end'
        ? [...(dragonDefeated ? [['end_city', '进入末地城'] as [string, string], ['overworld', '经祭坛返回主世界'] as [string, string]] : [['dragon', '挑战末影龙'] as [string, string]])]
        : [['overworld', '返回主世界'], ['end', '返回末地']]
  $('#journey-actions').innerHTML = actions.map(([action, label]) => `<button class="menu-option" data-journey="${action}">${label}<span>→</span></button>`).join('')
}

const emoteNames = [
  '挥手', '鼓掌', '跳舞', '鞠躬', '点头', '摇头', '欢呼', '思考', '旋转', '跳跃',
  '敬礼', '招手', '摇摆', '伸展', '庆祝', '惊讶', '害羞', '冲刺', '蹲下', '起立',
  '拍手', '举手', '左右看', '转圈', '胜利', '太空步', '晚安', '早安',
]
const skinShop = [
  { id: 'forest', name: '森林旅行者', price: 20, colors: ['#71ad76', '#366b50'] },
  { id: 'starlight', name: '星光探险家', price: 30, colors: ['#647bc4', '#d7b5e8'] },
  { id: 'sunrise', name: '朝霞精灵', price: 40, colors: ['#e9a278', '#f4da8b'] },
]
const itemShop = [
  { id: 'diamond', count: 8, price: 20 },
  { id: 'iron_ingot', count: 16, price: 12 },
  { id: 'bread', count: 16, price: 8 },
  { id: 'ender_eye', count: 12, price: 30 },
  { id: 'oak_planks', count: 32, price: 5 },
]
const workshopMods = [
  { id: 'shader', name: '柔光光影', price: 15, detail: '让阳光与天空色彩更明亮' },
  { id: 'realistic', name: '真实光影', price: 20, detail: '启用电影色调与更远的雾景' },
  { id: 'double_loot', name: '双倍掉落', price: 25, detail: '挖掘与战斗获得更多材料' },
  { id: 'excavator', name: '连锁挖掘', price: 30, detail: '每次挖掘额外移除相邻方块' },
]
let emoteIndex = -1
let emoteUntil = 0

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

function renderSkinGrid(): void {
  $('#skin-grid').innerHTML = skinPixels.map((color, index) => `<button data-pixel="${index}" style="background:${color}" aria-label="皮肤像素 ${index + 1}"></button>`).join('')
  $<HTMLSelectElement>('#skin-shape').value = skinShape
  $('#skin-shop').innerHTML = `<h3>金币皮肤</h3>` + skinShop.map((skin) =>
    `<button class="menu-option" data-skin="${skin.id}">${skin.name}<span>${ownedSkins.has(skin.id) ? '已拥有 · 使用' : `${skin.price} 金币`}</span></button>`,
  ).join('')
  $('#item-shop').innerHTML = `<h3>金币物品</h3>` + itemShop.map((item) =>
    `<button class="menu-option" data-shop-item="${item.id}">${itemInfo(item.id).zh} ×${item.count}<span>${item.price} 金币</span></button>`,
  ).join('')
}

async function spendCoins(sku: string, price: number): Promise<boolean> {
  if (coins < price) { showToast('金币不足，点菜单里的＋免费增加'); return false }
  if (onlineReady && online.user) {
    const result = await online.request<{ coins: number }>('POST', '/api/coins/spend', { sku })
    coins = result.coins
    online.user.coins = coins
  } else coins -= price
  updateStatus()
  return true
}

function applySkin(): void {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 8
  const context = canvas.getContext('2d')!
  skinPixels.forEach((color, index) => { context.fillStyle = color; context.fillRect(index % 8, Math.floor(index / 8), 1, 1) })
  avatarMaterial.map?.dispose()
  const texture = new THREE.CanvasTexture(canvas)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  avatarMaterial.map = texture
  avatarMaterial.color.set('#ffffff')
  avatarMaterial.needsUpdate = true
  avatar.scale.setScalar(skinShape === 'item' ? 0.55 : 1)
  avatar.children.forEach((child, index) => { child.visible = skinShape !== 'item' || index === 1 })
}

function renderEmotes(): void {
  $('#emote-list').innerHTML = emoteNames.map((name, index) => `<button data-emote="${index}">${index + 1}. ${name}</button>`).join('')
}

function renderWorkshop(): void {
  const query = $<HTMLInputElement>('#mod-search').value.trim().toLowerCase()
  const templates = workshopMods.filter((mod) => !query || mod.name.includes(query) || mod.id.includes(query))
  const created = customMods.filter((mod) => !query || mod.name.toLowerCase().includes(query))
  $('#mod-list').innerHTML = `<h3>效果模组</h3>` + templates.map((mod) =>
    `<button class="menu-option" data-mod="${mod.id}">${mod.name}<span>${ownedMods.has(mod.id) ? '已启用' : `${mod.price} 金币`}</span><small>${mod.detail}</small></button>`,
  ).join('') + `<h3>我的方块模组</h3>` + (created.length ? created.map((mod) =>
    `<div class="menu-option">${swatch(mod.id)} ${escapeHtml(mod.name)}<span>已制作</span></div>`,
  ).join('') : '<p class="panel-hint">还没有自制模组。</p>')
}

function renderLobby(): void {
  const rooms = [
    ['mining', '挖掘赛', '挖掘 10 块方块'],
    ['treasure', '寻宝赛', '走到 x=12、z=12 寻找宝藏'],
    ['parkour', '跳跃赛', '完成 8 次跳跃'],
  ]
  $('#mini-status').textContent = activeMiniGame ? `当前挑战：${rooms.find(([id]) => id === activeMiniGame)?.[1]}，进度 ${miniProgress}` : '选择一个小游戏房间开始挑战。'
  $('#mini-rooms').innerHTML = rooms.map(([id, name, detail]) => `<button class="menu-option" data-mini="${id}">${name}<span>${detail}</span></button>`).join('')
}

function advanceMiniGame(kind: string): void {
  if (activeMiniGame !== kind) return
  miniProgress++
  const target = kind === 'mining' ? 10 : kind === 'parkour' ? 8 : 1
  if (miniProgress >= target) {
    activeMiniGame = null
    miniProgress = 0
    if (onlineReady && online.user) {
      void online.request<{ coins: number }>('POST', '/api/coins/claim', { amount: 30 }).then((result) => {
        coins = result.coins
        if (online.user) online.user.coins = coins
        updateStatus()
        saveWorld()
        showToast('小游戏挑战完成，获得 30 金币！')
      }).catch((error: Error) => showToast(error.message))
      showToast('小游戏挑战完成，正在发放金币…')
    } else {
      coins += 30
      updateStatus()
      showToast('小游戏挑战完成，获得 30 金币！')
    }
  }
  saveWorld()
}

function remoteAvatar(userId: string): THREE.Group {
  let group = remoteAvatars.get(userId)
  if (group) return group
  group = new THREE.Group()
  const color = new THREE.Color().setHSL([...userId].reduce((value, char) => value + char.charCodeAt(0), 0) % 360 / 360, 0.5, 0.6)
  const material = new THREE.MeshLambertMaterial({ color })
  for (const [width, height, y] of [[0.55, 0.85, 1.05], [0.45, 0.45, 1.68], [0.2, 0.7, 0.35]]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.35), material)
    mesh.position.y = y
    group.add(mesh)
  }
  scene.add(group)
  remoteAvatars.set(userId, group)
  return group
}

function leaveOnlineWorld(): void {
  online.socket?.close()
  online.socket = null
  onlineWorldId = null
  for (const group of remoteAvatars.values()) scene.remove(group)
  remoteAvatars.clear()
  if (!localSnapshot) return
  const snapshot = localSnapshot
  localSnapshot = null
  world.setDimension(snapshot.dimension, snapshot.edits[snapshot.dimension] ?? [])
  player.x = snapshot.player.x
  player.z = snapshot.player.z
  player.foot = snapshot.player.foot
  player.yaw = snapshot.player.yaw
  player.pitch = snapshot.player.pitch
  entities.removeAll()
  if (world.dimension === 'overworld') {
    for (const [kind, x, z] of [
      ['chicken', 4, 6], ['sheep', -5, 3], ['cow', 6, -5], ['pig', -6, -6],
    ] as [MobKind, number, number][]) entities.spawn(kind, x, z)
  }
  sea.visible = world.dimension === 'overworld'
  saveWorld()
  showToast('已退出好友世界')
}

function handleOnlineMessage(message: Record<string, unknown>): void {
  if (message.type === 'disconnected') {
    leaveOnlineWorld()
    showToast('联机连接已断开，请重新进入好友世界')
    return
  }
  if (message.type === 'error') return showToast(String(message.message ?? '联机出错'))
  if (message.type === 'world' && Array.isArray(message.edits) && typeof message.worldId === 'string') {
    if (!localSnapshot) localSnapshot = {
      dimension: world.dimension,
      edits: { ...editsByDimension, [world.dimension]: [...world.edits] },
      player: { x: player.x, z: player.z, foot: player.foot, yaw: player.yaw, pitch: player.pitch },
    }
    onlineWorldId = message.worldId
    sharedEdits = {}
    for (const entry of message.edits) {
      if (!entry || typeof entry !== 'object' || !['overworld', 'nether', 'end', 'end_city'].includes(entry.dimension)) continue
      const dim = entry.dimension as Dimension
      if (!Number.isInteger(entry.x) || !Number.isInteger(entry.y) || !Number.isInteger(entry.z)) continue
      const block = typeof entry.block_id === 'string' && BLOCKS.some((item) => item.id === entry.block_id) ? entry.block_id : null
      ;(sharedEdits[dim] ??= []).push([`${entry.x},${entry.y},${entry.z}`, block])
    }
    world.setDimension('overworld', sharedEdits.overworld ?? [])
    player.x = 0.5; player.z = 0.5; player.foot = world.surfaceTop(0, 0)
    entities.removeAll()
    for (const entry of Array.isArray(message.entities) ? message.entities : []) {
      if (entry.dimension === 'overworld' && entry.kind in mobInfo && Number.isFinite(entry.x) && Number.isFinite(entry.z)) {
        entities.spawn(entry.kind as MobKind, entry.x, entry.z)
      }
    }
    closePanels(); showToast('已进入好友世界')
    return
  }
  if (message.type === 'edit' && onlineWorldId && ['overworld', 'nether', 'end', 'end_city'].includes(String(message.dimension))) {
    const dim = message.dimension as Dimension
    if (![message.x, message.y, message.z].every(Number.isInteger)) return
    const block = typeof message.blockId === 'string' && BLOCKS.some((item) => item.id === message.blockId) ? message.blockId : null
    if (dim === world.dimension) world.setBlock(Number(message.x), Number(message.y), Number(message.z), block)
    const key = `${message.x},${message.y},${message.z}`
    sharedEdits[dim] = [...(sharedEdits[dim] ?? []).filter(([id]) => id !== key), [key, block]]
    return
  }
  if (message.type === 'spawn' && message.dimension === world.dimension && typeof message.kind === 'string' && message.kind in mobInfo && Number.isFinite(message.x) && Number.isFinite(message.z)) {
    entities.spawn(message.kind as MobKind, Number(message.x), Number(message.z))
    return
  }
  if (message.type === 'state' && typeof message.userId === 'string' && [message.x, message.z, message.foot, message.yaw].every(Number.isFinite)) {
    const model = remoteAvatar(message.userId)
    model.position.set(Number(message.x), Number(message.foot), Number(message.z))
    model.rotation.y = Number(message.yaw)
    model.visible = message.dimension === world.dimension
    return
  }
  if (message.type === 'left' && typeof message.userId === 'string') {
    const group = remoteAvatars.get(message.userId)
    if (group) scene.remove(group)
    remoteAvatars.delete(message.userId)
  }
}

async function renderOnline(): Promise<void> {
  const content = $('#online-content')
  if (!onlineReady) {
    content.innerHTML = '<p class="panel-hint">联机服务器尚未接通。单人游戏和本机工坊仍可使用。</p>'
    return
  }
  if (!online.user) {
    content.innerHTML = `
      <p class="panel-hint">创建游戏账号后，可以通过名字添加好友并邀请进入世界。</p>
      <input id="online-name" class="search-input" maxlength="20" placeholder="用户名（3～20 字）" autocomplete="username" />
      <input id="online-password" class="search-input" type="password" placeholder="密码（至少 8 位）" autocomplete="current-password" />
      <div class="bench-controls"><button class="menu-option" data-online-auth="login">登录</button><button class="menu-option" data-online-auth="register">注册</button></div>`
    return
  }
  content.innerHTML = `<p class="panel-hint">当前账号：${escapeHtml(online.user.username)} · 金币 ${online.user.coins}</p>
    ${onlineWorldId ? '<button class="menu-option" data-online-leave>退出好友世界</button>' : ''}
    <h3>好友</h3><input id="friend-search" class="search-input" placeholder="输入好友名字" />
    <button class="menu-option" data-friend-search>搜索好友</button><div id="friend-results"></div><div id="friend-list"></div>
    <h3>我的世界与邀请</h3><input id="world-name" class="search-input" placeholder="给新世界取名" />
    <button class="menu-option" data-world-create>创建并开放当前世界</button><div id="online-world-list"></div>
    <h3>共享工坊</h3><input id="shared-search" class="search-input" placeholder="搜索共享皮肤和模组" />
    <button class="menu-option" data-shared-search>搜索作品</button>
    <button class="menu-option" data-shared-publish="skin">发布当前皮肤</button>
    <button class="menu-option" data-shared-publish="mod">发布最近制作的模组</button>
    <div id="shared-products"></div><button class="menu-option" data-online-logout>退出账号</button>`
  await refreshOnlineLists()
}

async function refreshOnlineLists(): Promise<void> {
  if (!online.user) return
  try {
    const [friends, worlds] = await Promise.all([
      online.request<{ friends: OnlineFriend[] }>('GET', '/api/friends'),
      online.request<{ worlds: OnlineWorld[] }>('GET', '/api/worlds'),
    ])
    const friendList = $('#friend-list')
    const worldList = $('#online-world-list')
    if (friendList) friendList.innerHTML = friends.friends.map((friend) => `<div class="menu-option">${escapeHtml(friend.username)}<span>${friend.status === 'accepted' ? '已添加' : friend.incoming ? `<button data-friend-accept="${friend.id}">同意</button>` : '等待同意'}</span></div>`).join('') || '<p class="panel-hint">还没有好友。</p>'
    if (worldList) worldList.innerHTML = worlds.worlds.map((entry) => `<div class="online-world-card"><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.owner_name ?? online.user!.username)}</small><button data-world-join="${entry.id}">进入</button>${entry.owner_id === online.user!.id ? `<button data-world-toggle="${entry.id}" data-open="${entry.is_open ? 'false' : 'true'}">${entry.is_open ? '关闭' : '开放'}</button><button data-world-invite="${entry.id}">拉好友</button>` : ''}</div>`).join('') || '<p class="panel-hint">还没有联机世界。</p>'
  } catch (error) { showToast((error as Error).message) }
}

async function searchShared(): Promise<void> {
  if (!online.user) return
  const query = $<HTMLInputElement>('#shared-search').value.trim()
  try {
    const result = await online.request<{ products: WorkshopProduct[] }>('GET', `/api/workshop?q=${encodeURIComponent(query)}`)
    sharedProducts.clear()
    result.products.forEach((product) => sharedProducts.set(product.id, product))
    $('#shared-products').innerHTML = result.products.map((product) => `<div class="online-world-card"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.author)} · ${product.kind === 'skin' ? '皮肤' : '方块模组'}</small><button data-shared-buy="${product.id}">${product.price} 金币 · 获取</button></div>`).join('') || '<p class="panel-hint">没有找到作品。</p>'
  } catch (error) { showToast((error as Error).message) }
}

function travel(dimension: Dimension): void {
  const editStore = onlineWorldId ? sharedEdits : editsByDimension
  editStore[world.dimension] = [...world.edits]
  world.setDimension(dimension, editStore[dimension] ?? [])
  entities.removeAll()
  if (dimension === 'nether') {
    entities.spawn('blaze', 9, 9)
    entities.spawn('blaze', 11, 8)
    entities.spawn('piglin', -9, -7)
    entities.spawn('piglin', -7, -9)
  } else if (dimension === 'end' && !dragonDefeated) entities.spawn('ender_dragon', 10, 0)
  else if (dimension === 'end_city') entities.spawn('enderman', 7, 8)
  else if (dimension === 'overworld') {
    for (const [kind, x, z] of [
      ['chicken', 4, 6], ['sheep', -5, 3], ['cow', 6, -5], ['pig', -6, -6],
    ] as [MobKind, number, number][]) entities.spawn(kind, x, z)
  }
  player.x = 0.5
  player.z = 0.5
  player.foot = world.surfaceTop(0, 0)
  player.velocityY = 0
  sea.visible = dimension === 'overworld'
  closePanels()
  saveWorld()
  showToast(`已到达${{ overworld: '主世界', nether: '下界', end: '末地', end_city: '末地城' }[dimension]}`)
}

function receiveDamage(amount: number): void {
  if (mode === 'creative' || mode === 'spectator' || !playing) return
  health = Math.max(0, health - amount)
  const flash = $('#damage-flash')
  flash.classList.remove('visible')
  void flash.offsetWidth
  flash.classList.add('visible')
  updateStatus()
  showToast(`受到攻击，损失 ${amount} 点血量`)
  if (health > 0) return
  if (mode === 'hardcore') {
    localStorage.removeItem(SAVE_KEY)
    localStorage.removeItem(OLD_SAVE_KEY)
    showToast('极限模式失败，世界已重置')
    window.setTimeout(() => window.location.reload(), 1600)
    return
  }
  health = transform ? mobInfo[transform].health : 40
  hunger = 20
  player.x = 0.5
  player.z = 0.5
  player.foot = world.surfaceTop(0, 0)
  showToast('你在起点重新醒来')
  updateStatus()
  saveWorld()
}

function runChineseCommand(raw: string): string {
  const command = raw.trim().replace(/^\//, '').replace(/\s+/g, '')
  if (!command) return '请输入指令'
  const timeName = command.match(/(?:时间|调到|改成|设为|切换到)?(白天|早上|中午|黄昏|傍晚|晚上|黑夜|午夜)/)
  const clock = command.match(/(?:时间|调到|改成|设为)?(\d{1,2})[:：点](\d{1,2})?分?/)
  if (timeName || clock) {
    const hour = clock ? Number(clock[1]) + Number(clock[2] ?? 0) / 60 : ({ 白天: 8, 早上: 6, 中午: 12, 黄昏: 18, 傍晚: 18, 晚上: 21, 黑夜: 22, 午夜: 0 } as Record<string, number>)[timeName![1]]
    if (hour < 0 || hour >= 24 || clock && Number(clock[2] ?? 0) >= 60) return '时间格式应为 0:00 至 23:59'
    timeOfDay = hour >= 6 && hour < 18 ? (hour - 6) / 12 * DAY_END
      : DAY_END + ((hour < 6 ? hour + 24 : hour) - 18) / 12 * (1 - DAY_END)
    saveWorld()
    return `时间已调到 ${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round(hour % 1 * 60)).padStart(2, '0')}`
  }
  const modeEntry = Object.entries(modeNames).find(([, name]) => command.includes(name + '模式'))
  if (modeEntry) {
    mode = modeEntry[0] as GameMode
    if (mode !== 'creative') flying = false
    updateStatus(); saveWorld()
    return `已切换到${modeEntry[1]}模式`
  }
  const dimension = ({ 主世界: 'overworld', 下界: 'nether', 末地城: 'end_city', 末地: 'end' } as Record<string, Dimension>)[command.match(/末地城|主世界|下界|末地/)?.[0] ?? '']
  if (dimension && /传送|前往|去/.test(command)) { travel(dimension); return `已前往${command.match(/末地城|主世界|下界|末地/)![0]}` }
  if (/恢复生命|回满血|治疗|加满血/.test(command)) { health = transform ? mobInfo[transform].health : 40; updateStatus(); saveWorld(); return '生命已恢复' }
  if (/恢复饱食度|吃饱|加满饱食度/.test(command)) { hunger = 20; updateStatus(); saveWorld(); return '饱食度已恢复' }
  const give = command.match(/(?:给我|获得|获取)(\d+)?(?:个|块|组)?(.+)/)
  if (give) {
    const count = Math.min(400, Number(give[1] ?? 1))
    const name = give[2]
    const id = Object.keys(allItems).find((item) => item === name || allItems[item].zh === name || allItems[item].en.toLowerCase() === name.toLowerCase())
    if (!id) return `找不到物品：${name}`
    const left = addItem(inventory, id, count)
    renderHotbar(); saveWorld()
    return left ? `背包已满，获得了${itemInfo(id).zh} ×${count - left}` : `获得了${itemInfo(id).zh} ×${count}`
  }
  const summonName = command.match(/(?:召唤|生成)(.+)/)?.[1]
  if (summonName) {
    const kind = (Object.keys(mobInfo) as MobKind[]).find((id) => id === summonName || mobInfo[id].name === summonName)
    if (!kind) return `找不到生物：${summonName}`
    entities.spawn(kind, Math.min(18, player.x + 2), Math.min(18, player.z + 2))
    return `已召唤${mobInfo[kind].name}`
  }
  if (/跳过夜晚|天亮/.test(command)) { timeOfDay = 0; day++; saveWorld(); return '天亮了' }
  return '暂不支持这条指令。可试：调到晚上、给我 64 个钻石、切换创造模式。'
}

function attackMob(mob: Mob): void {
  if (mode === 'spectator') return showToast('旁观者不能攻击')
  const held = inventory[selectedIndex]?.id
  const damage = held === 'greedy_sword' ? 40 : held === 'rifle' ? 25 : held === 'pistol' ? 9
    : held?.endsWith('_sword') ? held.includes('diamond') || held.includes('netherite') ? 9 : 5 : 2
  const defeated = entities.hit(mob, damage)
  if (defeated) {
    if (mob.kind === 'ender_dragon') dragonDefeated = true
    unlockedMobs.add(mob.kind)
    for (const [id, count] of mobInfo[mob.kind].loot) {
      const left = addItem(inventory, id, count)
      if (left) showToast('背包已满，部分掉落物无法拾取')
    }
    experience += Math.max(2, Math.ceil(mobInfo[mob.kind].health / 4))
    renderHotbar()
    updateStatus()
    saveWorld()
    showToast(`击败${mobInfo[mob.kind].name}，已解锁变身`)
  } else showToast(`命中${mobInfo[mob.kind].name} · ${damage} 点伤害`)
}

function mine(): void {
  if (!playing || panelOpen) return
  if (currentMob) return attackMob(currentMob)
  if (mode === 'spectator' || mode === 'adventure') return showToast('当前模式不能挖掘方块')
  if (!currentTarget) return showToast('请先用准星对准方块')
  const { x, y, z, id } = currentTarget
  if (mode !== 'creative' && !inventory.some((slot) => slot === null || slot.id === blockItems[id] && slot.count < itemInfo(slot.id).stack)) {
    return showToast('背包已满')
  }
  let removed = 0
  for (const [bx, by, bz] of ownedMods.has('excavator') ? [[x, y, z], [x - 1, y, z], [x + 1, y, z]] : [[x, y, z]]) {
    const type = world.getBlock(bx, by, bz)
    if (!type || !world.setBlock(bx, by, bz, null)) continue
    if (onlineWorldId) online.send({ type: 'edit', dimension: world.dimension, x: bx, y: by, z: bz, blockId: null })
    if (mode !== 'creative') addItem(inventory, blockItems[type], ownedMods.has('double_loot') ? 2 : 1)
    removed++
    mined++
    experience += 1
    advanceMiniGame('mining')
  }
  if (removed > 0) {
    $('#mine-count').textContent = `已挖掘 ${mined} 块`
    showToast(`获得了${BLOCKS.find((item) => item.id === id)!.name}${removed > 1 ? `等 ${removed} 块` : ''}`)
    renderHotbar()
    updateStatus()
    saveWorld()
    updateTarget()
  }
}

const foodValues: Record<string, number> = {
  apple: 4, golden_apple: 4, enchanted_golden_apple: 4, bread: 5, cookie: 2, cake: 7,
  carrot: 3, golden_carrot: 6, potato: 1, baked_potato: 5, beetroot: 1,
  mushroom_stew: 6, rabbit_stew: 10, beetroot_soup: 6, suspicious_stew: 6,
  chicken: 2, cooked_chicken: 6, mutton: 2, cooked_mutton: 6,
  beef: 3, cooked_beef: 8, porkchop: 3, cooked_porkchop: 8,
  rabbit: 3, cooked_rabbit: 5, cod: 2, cooked_cod: 5,
  salmon: 2, cooked_salmon: 6, tropical_fish: 1, pufferfish: 1,
  melon_slice: 2, sweet_berries: 2, glow_berries: 2, dried_kelp: 1,
  pumpkin_pie: 8, honey_bottle: 6, rotten_flesh: 4,
}

function eatFood(preferredIndex = selectedIndex): void {
  if (!playing || panelOpen) return
  const index = inventory[preferredIndex] && foodValues[inventory[preferredIndex]!.id]
    ? preferredIndex : inventory.findIndex((slot) => !!slot && !!foodValues[slot.id])
  if (index < 0) return showToast('背包里没有可以吃的食物')
  const slot = inventory[index]!
  if (hunger >= 20 && health >= (transform ? mobInfo[transform].health : 40)) return showToast('现在不饿，也不需要恢复生命')
  const id = slot.id
  hunger = Math.min(20, hunger + foodValues[id])
  health = Math.min(transform ? mobInfo[transform].health : 40, health + (id.includes('golden_apple') ? 6 : 1))
  if (mode !== 'creative') {
    slot.count--
    if (slot.count === 0) inventory[index] = null
  }
  renderHotbar(); updateStatus(); saveWorld(); showToast(`吃了${itemInfo(id).zh}`)
}

function dropFromSlot(index: number, wholeStack: boolean): void {
  if (!playing) return
  const slot = inventory[index]
  if (!slot) return showToast('选中的格子是空的')
  if (droppedItems.length >= 100) return showToast('地上的掉落物太多')
  const count = wholeStack ? slot.count : 1
  const id = slot.id
  slot.count -= count
  if (slot.count === 0) inventory[index] = null
  const x = Math.max(-19, Math.min(19, player.x - Math.sin(player.yaw) * 1.35))
  const z = Math.max(-19, Math.min(19, player.z - Math.cos(player.yaw) * 1.35))
  spawnDroppedItem(id, count, x, z, world.dimension)
  if (!$('#inventory-panel').classList.contains('hidden')) renderInventory()
  renderHotbar(); saveWorld()
  showToast(`丢出了${itemInfo(id).zh} ×${count}，靠近可捡回`)
}

function place(): void {
  if (!playing || panelOpen) return
  const slot = inventory[selectedIndex]
  if (!slot) return showToast('选择一种材料后再放置')
  if (foodValues[slot.id]) return eatFood(selectedIndex)
  if (slot.id.endsWith('_bed')) {
    if (timeOfDay < DAY_END) return showToast('天还没黑，晚上才能睡觉')
    if (sleeping) return showToast('正在睡觉')
    sleeping = true
    showToast('正在睡觉，10 秒后天亮')
    window.setTimeout(() => { timeOfDay = 0; day++; sleeping = false; saveWorld(); showToast('早上好！') }, 10000)
    return
  }
  if (slot.id === 'flint_and_steel') {
    if (!currentTarget) return showToast('请先对准要点燃的方块')
    const { x, y, z, nx, ny, nz } = currentTarget
    const bx = x + nx, by = y + ny, bz = z + nz
    if (world.getBlock(bx, by, bz)) return showToast('这里无法点火')
    if (!world.setBlock(bx, by, bz, 'fire')) return showToast('这里无法点火')
    if (onlineWorldId) online.send({ type: 'edit', dimension: world.dimension, x: bx, y: by, z: bz, blockId: 'fire' })
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const id = world.getBlock(bx + dx, by - 1, bz + dz)
      if (id === 'wood' || id === 'leaves' || id?.endsWith('_planks')) {
        window.setTimeout(() => {
          if (world.getBlock(bx + dx, by - 1, bz + dz) === id) world.setBlock(bx + dx, by - 1, bz + dz, null)
          saveWorld()
        }, 2500)
      }
    }
    window.setTimeout(() => { if (world.getBlock(bx, by, bz) === 'fire') world.setBlock(bx, by, bz, null); saveWorld() }, 10000)
    showToast('方块着火了，火焰会造成伤害')
    saveWorld()
    return
  }
  if (mode === 'spectator' || mode === 'adventure') return showToast('当前模式不能放置方块')
  if (!currentTarget) return showToast('请先用准星对准方块')
  const { x, y, z, nx, ny, nz } = currentTarget
  let id = placeableItems[slot.id]
  if (slot.id === 'painting' || slot.id === 'item_frame') {
    if (ny !== 0) return showToast('画和展示框只能挂在墙面上')
    id = `${slot.id}_${nx > 0 ? 'east' : nx < 0 ? 'west' : nz > 0 ? 'south' : 'north'}`
  }
  if (!id) return showToast('这个物品不能直接放置')
  const px = x + nx
  const py = y + ny
  const pz = z + nz
  if (Math.abs(px + 0.5 - player.x) < 0.82 && Math.abs(pz + 0.5 - player.z) < 0.82 && py < player.foot + 1.7 && py + 1 > player.foot) {
    return showToast('不能在自己站的位置放方块')
  }
  if (world.setBlock(px, py, pz, id)) {
    if (onlineWorldId) online.send({ type: 'edit', dimension: world.dimension, x: px, y: py, z: pz, blockId: id })
    if (mode !== 'creative') takeItem(inventory, slot.id, 1)
    showToast(`放置了${BLOCKS.find((item) => item.id === id)!.name}`)
    renderHotbar()
    saveWorld()
    updateTarget()
  } else showToast('这里无法放置方块')
}

function collides(x: number, z: number, foot: number): boolean {
  const sneak = crouching || keys.has('Shift')
  for (const dx of [-0.28, 0.28]) {
    for (const dz of [-0.28, 0.28]) {
      for (const dy of sneak ? [0.15, 0.65, 1.16] : [0.15, 0.9, 1.5]) {
        const block = world.getBlock(Math.floor(x + dx), Math.floor(foot + dy), Math.floor(z + dz))
        if (block && !block.startsWith('painting_') && !block.startsWith('item_frame_') && block !== 'fire') return true
      }
    }
  }
  return false
}

function hasSafeFooting(x: number, z: number, foot: number): boolean {
  for (const dx of [-0.27, 0.27]) for (const dz of [-0.27, 0.27]) {
    const block = world.getBlock(Math.floor(x + dx), Math.floor(foot - 0.06), Math.floor(z + dz))
    if (!block || block === 'fire' || block.startsWith('painting_') || block.startsWith('item_frame_')) return false
  }
  return true
}

function jump(): void {
  if (flying || mode === 'spectator') { player.foot = Math.min(25, player.foot + 0.35); return }
  if (playing && !panelOpen && player.grounded) {
    player.velocityY = 6.3
    player.grounded = false
    advanceMiniGame('parkour')
  }
}

const movement = { x: 0, y: 0 }
const keys = new Set<string>()
let highestAirFoot = player.foot

function movePlayer(dt: number): void {
  let side = movement.x + (keys.has('d') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('a') || keys.has('ArrowLeft') ? 1 : 0)
  let forward = -movement.y + (keys.has('w') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('s') || keys.has('ArrowDown') ? 1 : 0)
  const magnitude = Math.hypot(side, forward)
  if (magnitude > 1) { side /= magnitude; forward /= magnitude }
  const sneak = crouching || keys.has('Shift')
  const run = (sprinting || keys.has('Control')) && !sneak && hunger > 0
  const speed = (sneak ? 1.75 : run ? 7.2 : 4.2) * dt
  const dx = (side * Math.cos(player.yaw) - forward * Math.sin(player.yaw)) * speed
  const dz = (-side * Math.sin(player.yaw) - forward * Math.cos(player.yaw)) * speed
  const nextX = Math.max(-world.radius + 0.35, Math.min(world.radius - 0.35, player.x + dx))
  const nextZ = Math.max(-world.radius + 0.35, Math.min(world.radius - 0.35, player.z + dz))
  if (mode === 'spectator' || !collides(nextX, player.z, player.foot) && (!sneak || !player.grounded || hasSafeFooting(nextX, player.z, player.foot))) player.x = nextX
  if (mode === 'spectator' || !collides(player.x, nextZ, player.foot) && (!sneak || !player.grounded || hasSafeFooting(player.x, nextZ, player.foot))) player.z = nextZ

  if (flying || mode === 'spectator') {
    player.velocityY = 0
    player.foot = Math.max(1, Math.min(25, player.foot + (forward * Math.sin(player.pitch) * -4.2 + (flyRise ? 3 : 0)) * dt))
    return
  }

  if (player.grounded) highestAirFoot = player.foot
  else highestAirFoot = Math.max(highestAirFoot, player.foot)
  player.velocityY -= 17 * dt
  let nextFoot = player.foot + player.velocityY * dt
  let fallDamage = 0
  player.grounded = false
  if (player.velocityY <= 0) {
    for (let top = Math.floor(player.foot); top >= Math.ceil(nextFoot); top--) {
      let supported = false
      for (const ox of [-0.26, 0.26]) {
        for (const oz of [-0.26, 0.26]) {
          const support = world.getBlock(Math.floor(player.x + ox), top - 1, Math.floor(player.z + oz))
          if (support && support !== 'fire' && !support.startsWith('painting_') && !support.startsWith('item_frame_')) supported = true
        }
      }
      if (supported) {
        const fallDistance = highestAirFoot - top
        nextFoot = top
        player.velocityY = 0
        player.grounded = true
        if (fallDistance > 3.4) fallDamage = Math.max(1, Math.floor((fallDistance - 3) * 2))
        highestAirFoot = top
        break
      }
    }
  } else if (collides(player.x, player.z, nextFoot)) {
    nextFoot = player.foot
    player.velocityY = 0
  }
  player.foot = nextFoot
  if (fallDamage > 0) receiveDamage(fallDamage)
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
  if (selector === '#craft-panel') { renderCraftGrid(); renderRecipes() }
  if (selector === '#mob-panel') renderMobs()
  if (selector === '#journey-panel') renderJourney()
  if (selector === '#skin-panel') renderSkinGrid()
  if (selector === '#emote-panel') renderEmotes()
  if (selector === '#workshop-panel') renderWorkshop()
  if (selector === '#lobby-panel') renderLobby()
  if (selector === '#online-panel') void renderOnline()
  saveWorld()
}

function closePanels(): void {
  $('#inventory-panel').classList.add('hidden')
  $('#menu-panel').classList.add('hidden')
  $('#craft-panel').classList.add('hidden')
  $('#mob-panel').classList.add('hidden')
  $('#journey-panel').classList.add('hidden')
  $('#skin-panel').classList.add('hidden')
  $('#emote-panel').classList.add('hidden')
  $('#workshop-panel').classList.add('hidden')
  $('#lobby-panel').classList.add('hidden')
  $('#online-panel').classList.add('hidden')
  $('#command-panel').classList.add('hidden')
  panelOpen = false
}

renderHotbar()
updateStatus()
applySkin()
if (ownedMods.has('realistic')) renderer.toneMapping = THREE.ACESFilmicToneMapping
void online.available().then(async (available) => {
  onlineReady = available
  if (available) {
    const account = await online.restore()
    if (account) { coins = account.coins; updateStatus() }
  }
  if (!$('#online-panel').classList.contains('hidden')) void renderOnline()
})
$('#mine-count').textContent = `已挖掘 ${mined} 块`
hotbar.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-slot]')
  if (!button) return
  selectedIndex = Number(button.dataset.slot)
  renderHotbar()
})
catalog.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-item]')
  if (!button || !button.dataset.item || !allItems[button.dataset.item]) return
  catalogChoice = button.dataset.item
  renderCatalog()
})
inventoryGrid.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-inventory-slot]')
  if (!button) return
  const index = Number(button.dataset.inventorySlot)
  if (mode === 'creative') inventory[index] = { id: catalogChoice, count: itemInfo(catalogChoice).stack }
  else if (inventorySelection === null) inventorySelection = index
  else {
    ;[inventory[inventorySelection], inventory[index]] = [inventory[index], inventory[inventorySelection]]
    inventorySelection = null
  }
  renderInventory()
  renderHotbar()
  saveWorld()
})
$<HTMLInputElement>('#item-search').addEventListener('input', renderCatalog)
$('#start-button').addEventListener('click', () => {
  playing = true
  $('#welcome').classList.add('hidden')
  if (window.matchMedia('(pointer: coarse)').matches && screen.orientation?.lock) {
    void screen.orientation.lock('landscape').catch(() => {
      $('#landscape-hint').classList.toggle('hidden', window.innerWidth >= window.innerHeight)
    })
  }
  showToast('开始探索！对准方块试试挖掘')
})
$('#welcome-skin-button').addEventListener('click', () => openPanel('#skin-panel'))
$('#menu-button').addEventListener('click', () => openPanel('#menu-panel'))
$('#command-button').addEventListener('click', () => openPanel('#command-panel'))
$('#command-run').addEventListener('click', () => {
  const result = runChineseCommand($<HTMLInputElement>('#command-input').value)
  $('#command-status').textContent = result
  showToast(result)
})
$<HTMLInputElement>('#command-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') $('#command-run').click()
})
$('#transform-button').addEventListener('click', () => openPanel('#mob-panel'))
$('#inventory-button').addEventListener('click', () => openPanel('#inventory-panel'))
$('#eat-button').addEventListener('click', () => eatFood())
$('#drop-button').addEventListener('click', () => dropFromSlot(selectedIndex, false))
$('#inventory-drop-one').addEventListener('click', () => dropFromSlot(inventorySelection ?? selectedIndex, false))
$('#inventory-drop-stack').addEventListener('click', () => dropFromSlot(inventorySelection ?? selectedIndex, true))
$('#sprint-button').addEventListener('click', () => {
  sprinting = !sprinting
  if (sprinting) crouching = false
  $('#sprint-button').setAttribute('aria-pressed', String(sprinting))
  $('#crouch-button').setAttribute('aria-pressed', String(crouching))
  showToast(sprinting ? '疾跑已开启' : '疾跑已关闭')
})
$('#crouch-button').addEventListener('click', () => {
  crouching = !crouching
  if (crouching) sprinting = false
  $('#crouch-button').setAttribute('aria-pressed', String(crouching))
  $('#sprint-button').setAttribute('aria-pressed', String(sprinting))
  showToast(crouching ? '已蹲下：不会走出方块边缘' : '已站起')
})
$('#mob-list').addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-transform]')
  if (!button) {
    const spawnButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-spawn]')
    const kind = spawnButton?.dataset.spawn as MobKind | undefined
    if (!kind || !onlineWorldId || !unlockedMobs.has(kind)) return
    const x = Math.max(-18, Math.min(18, player.x + 2))
    const z = Math.max(-18, Math.min(18, player.z + 2))
    entities.spawn(kind, x, z)
    online.send({ type: 'spawn', dimension: world.dimension, kind, x, z })
    showToast(`已放置${mobInfo[kind].name}`)
    return
  }
  const kind = button.dataset.transform as MobKind | 'none'
  transform = kind === 'none' ? null : kind
  itemForm = null
  health = transform ? mobInfo[transform].health : 40
  hunger = 20
  updateFormAppearance()
  updateStatus()
  saveWorld()
  closePanels()
  showToast(transform ? `变成了${mobInfo[transform].name}` : '恢复玩家形态')
})
$<HTMLInputElement>('#morph-search').addEventListener('input', renderMorphItems)
$('#morph-items').addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-item-morph]')
  const id = button?.dataset.itemMorph
  if (!id || !allItems[id]) return
  itemForm = id
  transform = null
  health = 40
  updateFormAppearance()
  saveWorld(); closePanels(); showToast(`已变成${itemInfo(id).zh}`)
})
$('#craft-button').addEventListener('click', () => { closePanels(); openPanel('#craft-panel') })
$('#journey-button').addEventListener('click', () => { closePanels(); openPanel('#journey-panel') })
$('#coins-button').addEventListener('click', async () => {
  try {
    if (onlineReady && online.user) {
      const result = await online.request<{ coins: number }>('POST', '/api/coins/claim')
      coins = result.coins
      online.user.coins = coins
    } else coins += 10
    updateStatus(); saveWorld(); showToast('免费获得 10 金币')
  } catch (error) { showToast((error as Error).message) }
})
$('#skin-button').addEventListener('click', () => { closePanels(); openPanel('#skin-panel') })
$('#emote-button').addEventListener('click', () => { closePanels(); openPanel('#emote-panel') })
$('#workshop-button').addEventListener('click', () => { closePanels(); openPanel('#workshop-panel') })
$('#lobby-button').addEventListener('click', () => { closePanels(); openPanel('#lobby-panel') })
$('#online-button').addEventListener('click', () => { closePanels(); openPanel('#online-panel') })
$('#online-content').addEventListener('click', async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
  if (!button) return
  try {
    if (button.dataset.onlineAuth) {
      const username = $<HTMLInputElement>('#online-name').value.trim()
      const password = $<HTMLInputElement>('#online-password').value
      const account = await online.authenticate(button.dataset.onlineAuth as 'register' | 'login', username, password)
      coins = account.coins; updateStatus(); saveWorld(); await renderOnline(); return
    }
    if (button.hasAttribute('data-online-logout')) {
      leaveOnlineWorld(); online.logout(); await renderOnline(); return
    }
    if (button.hasAttribute('data-online-leave')) {
      leaveOnlineWorld(); await renderOnline(); return
    }
    if (button.hasAttribute('data-friend-search')) {
      const query = $<HTMLInputElement>('#friend-search').value.trim()
      if (!query) return showToast('请输入好友名字')
      const result = await online.request<{ users: { id: string; username: string }[] }>('GET', `/api/users?q=${encodeURIComponent(query)}`)
      $('#friend-results').innerHTML = result.users.map((user) => `<div class="menu-option">${escapeHtml(user.username)}<button data-friend-add="${user.id}">＋ 添加</button></div>`).join('') || '<p class="panel-hint">没有找到这个名字。</p>'
      return
    }
    if (button.dataset.friendAdd) {
      await online.request('POST', `/api/friends/${button.dataset.friendAdd}`)
      showToast('好友请求已发送'); await refreshOnlineLists(); return
    }
    if (button.dataset.friendAccept) {
      await online.request('POST', `/api/friends/${button.dataset.friendAccept}/accept`)
      showToast('已添加好友'); await refreshOnlineLists(); return
    }
    if (button.hasAttribute('data-world-create')) {
      if (onlineWorldId) return showToast('先退出当前好友世界')
      const name = $<HTMLInputElement>('#world-name').value.trim() || '我的小世界'
      const result = await online.request<{ world: OnlineWorld }>('POST', '/api/worlds', { name })
      const current = { ...editsByDimension, [world.dimension]: [...world.edits] }
      for (const [dimension, entries] of Object.entries(current)) {
        if (!entries?.length) continue
        const edits = entries.map(([key, block]) => [...key.split(',').map(Number), block])
        await online.request('POST', `/api/worlds/${result.world.id}/snapshot`, { dimension, edits })
      }
      await online.request('PATCH', `/api/worlds/${result.world.id}`, { isOpen: true })
      showToast('当前世界已开放，可以拉好友'); await refreshOnlineLists(); return
    }
    if (button.dataset.worldJoin) {
      if (onlineWorldId) leaveOnlineWorld()
      online.connect(button.dataset.worldJoin, handleOnlineMessage)
      showToast('正在进入好友世界…'); return
    }
    if (button.dataset.worldToggle) {
      await online.request('PATCH', `/api/worlds/${button.dataset.worldToggle}`, { isOpen: button.dataset.open === 'true' })
      await refreshOnlineLists(); return
    }
    if (button.dataset.worldInvite) {
      const username = window.prompt('输入已添加好友的用户名')?.trim()
      if (!username) return
      await online.request('POST', `/api/worlds/${button.dataset.worldInvite}/invite`, { username })
      showToast(`已邀请${username}进入世界`); return
    }
    if (button.hasAttribute('data-shared-search')) return await searchShared()
    if (button.dataset.sharedPublish) {
      const isSkin = button.dataset.sharedPublish === 'skin'
      const mod = customMods.at(-1)
      if (!isSkin && !mod) return showToast('请先在本机工坊制作一个方块模组')
      await online.request('POST', '/api/workshop', {
        kind: isSkin ? 'skin' : 'block_mod',
        name: isSkin ? `${online.user!.username}的皮肤` : mod!.name,
        price: isSkin ? 10 : 15,
        payload: isSkin ? { pixels: skinPixels } : { color: mod!.color },
      })
      showToast('作品已发布到共享工坊'); await searchShared(); return
    }
    if (button.dataset.sharedBuy) {
      const product = sharedProducts.get(button.dataset.sharedBuy)
      if (!product) return
      await online.request('POST', `/api/workshop/${product.id}/buy`)
      if (product.kind === 'skin' && product.payload && typeof product.payload === 'object' && 'pixels' in product.payload) {
        const pixels = (product.payload as { pixels: string[] }).pixels
        if (Array.isArray(pixels) && pixels.length === 64 && pixels.every((color) => /^#[0-9a-fA-F]{6}$/.test(color))) {
          skinPixels = pixels; skinShape = 'normal'; applySkin()
        }
      } else if (product.kind === 'block_mod' && product.payload && typeof product.payload === 'object' && 'color' in product.payload) {
        const color = String((product.payload as { color: string }).color)
        const id = `custom_${product.id.replaceAll('-', '').slice(0, 28)}`
        if (registerCustomBlock(id, product.name, color)) {
          customMods.push({ id, name: product.name, color })
          allItems[id] = { zh: product.name, en: product.name, stack: 64 }
          blockItems[id] = id; placeableItems[id] = id; addItem(inventory, id, 64); renderHotbar()
        }
      }
      const account = await online.request<{ user: { coins: number } }>('GET', '/api/me')
      coins = account.user.coins; if (online.user) online.user.coins = coins
      updateStatus(); saveWorld(); showToast('已获得工坊作品'); await renderOnline(); return
    }
  } catch (error) { showToast((error as Error).message) }
})
$('#skin-grid').addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-pixel]')
  if (!button) return
  const index = Number(button.dataset.pixel)
  skinPixels[index] = $<HTMLInputElement>('#skin-color').value
  button.style.background = skinPixels[index]
})
$('#skin-save').addEventListener('click', () => {
  skinShape = $<HTMLSelectElement>('#skin-shape').value as typeof skinShape
  applySkin(); saveWorld(); showToast('皮肤已保存')
})
$('#skin-shop').addEventListener('click', async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-skin]')
  const skin = skinShop.find((item) => item.id === button?.dataset.skin)
  if (!skin) return
  if (!ownedSkins.has(skin.id)) {
    try { if (!await spendCoins(`skin_${skin.id}`, skin.price)) return }
    catch (error) { return showToast((error as Error).message) }
    ownedSkins.add(skin.id)
  }
  skinPixels = Array.from({ length: 64 }, (_, index) => skin.colors[(Math.floor(index / 8) + index % 8) % skin.colors.length])
  skinShape = 'normal'
  applySkin(); updateStatus(); renderSkinGrid(); saveWorld(); showToast(`已使用${skin.name}`)
})
$('#item-shop').addEventListener('click', async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-shop-item]')
  const item = itemShop.find((entry) => entry.id === button?.dataset.shopItem)
  if (!item) return
  const inventoryCopy = inventory.map((slot) => slot ? { ...slot } : null)
  if (addItem(inventoryCopy, item.id, item.count) > 0) return showToast('背包空间不足')
  try { if (!await spendCoins(`item_${item.id}`, item.price)) return }
  catch (error) { return showToast((error as Error).message) }
  addItem(inventory, item.id, item.count)
  renderHotbar(); saveWorld(); showToast(`购买了${itemInfo(item.id).zh} ×${item.count}`)
})
$('#emote-list').addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-emote]')
  if (!button) return
  emoteIndex = Number(button.dataset.emote)
  emoteUntil = performance.now() + 3500
  thirdPerson = true
  updateStatus(); closePanels(); showToast(`动作：${emoteNames[emoteIndex]}`)
})
$('#mod-create').addEventListener('click', () => {
  const name = $<HTMLInputElement>('#mod-name').value.trim().slice(0, 24)
  const color = $<HTMLInputElement>('#mod-color').value
  if (!name) return showToast('先给模组取个名字')
  const id = `custom_${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`
  if (!registerCustomBlock(id, name, color)) return showToast('创建失败，请重试')
  customMods.push({ id, name, color })
  allItems[id] = { zh: name, en: name, stack: 64 }
  blockItems[id] = id
  placeableItems[id] = id
  addItem(inventory, id, 64)
  renderWorkshop(); renderHotbar(); saveWorld(); showToast(`已制作模组：${name}`)
})
$<HTMLInputElement>('#mod-search').addEventListener('input', renderWorkshop)
$('#mod-list').addEventListener('click', async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-mod]')
  const mod = workshopMods.find((item) => item.id === button?.dataset.mod)
  if (!mod) return
  if (ownedMods.has(mod.id)) return showToast('此模组已经启用')
  try { if (!await spendCoins(`mod_${mod.id}`, mod.price)) return }
  catch (error) { return showToast((error as Error).message) }
  ownedMods.add(mod.id)
  if (mod.id === 'realistic') renderer.toneMapping = THREE.ACESFilmicToneMapping
  updateStatus(); renderWorkshop(); saveWorld(); showToast(`已启用${mod.name}`)
})
$('#mini-rooms').addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-mini]')
  if (!button) return
  activeMiniGame = button.dataset.mini ?? null
  miniProgress = 0
  saveWorld(); closePanels(); showToast('小游戏开始，完成挑战可以获得金币')
})
$('#journey-actions').addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-journey]')
  if (!button) return
  const action = button.dataset.journey
  if (action === 'trade') {
    if (mode !== 'creative' && !takeItem(inventory, 'gold_ingot', 1)) return showToast('需要 1 个金锭')
    addItem(inventory, 'ender_pearl', 1)
    renderHotbar(); saveWorld(); return showToast('猪灵给了你一颗末影珍珠')
  }
  if (action === 'locate') {
    if (mode !== 'creative' && !takeItem(inventory, 'ender_eye', 1)) return showToast('需要 1 个末影之眼')
    strongholdLocated = true
    renderJourney(); renderHotbar(); saveWorld(); return showToast('要塞在东南方向，约 x=13、z=-9')
  }
  if (action === 'dragon') return showToast('用准星瞄准末影龙，点击攻击')
  if (action === 'end') {
    if (!strongholdLocated && mode !== 'creative') return showToast('先用末影之眼寻找要塞')
    if (mode !== 'creative' && Math.hypot(player.x - 13, player.z + 9) > 5) return showToast('请先走到要塞 x=13、z=-9')
    if (mode !== 'creative' && !takeItem(inventory, 'ender_eye', 12)) return showToast('激活传送门需要 12 个末影之眼')
    renderHotbar(); travel('end'); return
  }
  if (action === 'nether' || action === 'overworld' || action === 'end_city') travel(action)
})
$('#mode-button').addEventListener('click', () => {
  const modes = Object.keys(modeNames) as GameMode[]
  mode = modes[(modes.indexOf(mode) + 1) % modes.length]
  if (mode !== 'creative') flying = false
  updateStatus()
  saveWorld()
  showToast(`已切换到${modeNames[mode]}模式`)
})
$('#camera-button').addEventListener('click', () => {
  cameraMode = ((cameraMode + 1) % 3) as 0 | 1 | 2
  thirdPerson = cameraMode !== 0
  updateStatus()
  showToast(`已切换${['第一人称', '第三人称', '前置视角'][cameraMode]}`)
})
$('#flight-button').addEventListener('click', () => {
  if (mode !== 'creative' && mode !== 'spectator') return showToast('只有创造或旁观者模式可以飞行')
  flying = !flying
  updateStatus()
  showToast(flying ? '飞行已开启，抬头前进可上升' : '飞行已关闭')
})
$('#bench-less').addEventListener('click', () => { benchSize = Math.max(9, benchSize - 9); renderCraftGrid(); renderRecipes(); saveWorld() })
$('#bench-more').addEventListener('click', () => { benchSize = Math.min(3000, benchSize + 9); renderCraftGrid(); renderRecipes(); saveWorld() })
$('#craft-mode').addEventListener('click', () => {
  if (!usingWorkbench && !workbenchNearby()) return showToast('先用四块木板合成工作台，并放在身边')
  usingWorkbench = !usingWorkbench
  craftGrid = Array(usingWorkbench ? 9 : 4).fill(null)
  renderCraftGrid(); renderRecipes()
})
$('#craft-materials').addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-craft-material]')
  if (!button?.dataset.craftMaterial) return
  craftChoice = button.dataset.craftMaterial
  renderCraftGrid()
})
$('#craft-grid').addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-craft-cell]')
  if (!button) return
  const index = Number(button.dataset.craftCell)
  const prior = craftGrid[index]
  if (prior === craftChoice) craftGrid[index] = null
  else if (craftChoice && craftGrid.filter((id) => id === craftChoice).length < countItem(inventory, craftChoice)) craftGrid[index] = craftChoice
  else if (prior) craftGrid[index] = null
  else return showToast('先选择背包里的材料')
  renderCraftGrid()
})
$('#craft-grid-clear').addEventListener('click', () => { craftGrid.fill(null); renderCraftGrid() })
$('#craft-grid-make').addEventListener('click', () => {
  const match = matchingRecipe(craftGrid, usingWorkbench ? 3 : 2)
  if (!match || !craft(inventory, match, craftCapacity())) return showToast('配方未匹配或材料不足')
  experience += Math.max(1, Math.ceil(recipeSize(match) / 3))
  showToast(`合成了${itemInfo(match.result).zh} ×${match.count}`)
  craftGrid.fill(null); renderHotbar(); renderCraftGrid(); renderRecipes(); saveWorld()
})
$<HTMLInputElement>('#recipe-search').addEventListener('input', renderRecipes)
$('#recipe-list').addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-craft]')
  if (!button) return
  const recipe = recipes[Number(button.dataset.craft)]
  if (!recipe || !recipeFits(recipe, usingWorkbench ? 3 : 2) && !usingWorkbench || !canCraft(inventory, recipe, craftCapacity())) return showToast('材料不足、背包已满，或需要工作台')
  const width = usingWorkbench ? 3 : 2
  if (recipeFits(recipe, width)) {
    craftGrid = Array(width * width).fill(null)
    if (recipe.shape) recipe.shape.forEach((row, y) => row.forEach((id, x) => { craftGrid[y * width + x] = id }))
    else (recipe.ingredients ?? []).forEach((id, index) => { craftGrid[index] = id })
    renderCraftGrid()
    showToast('材料已填入格子，点击合成')
    return
  }
  if (!craft(inventory, recipe, craftCapacity())) return showToast('材料不足或背包已满')
  showToast(`合成了${itemInfo(recipe.result).zh} ×${recipe.count}`)
  experience += Math.max(1, Math.ceil(recipeSize(recipe) / 3))
  renderHotbar()
  renderRecipes()
  renderCraftGrid()
  updateStatus()
  saveWorld()
})
$('#mine-button').addEventListener('click', mine)
$('#place-button').addEventListener('click', place)
$('#jump-button').addEventListener('click', jump)
$('#jump-button').addEventListener('pointerdown', () => { flyRise = true })
for (const event of ['pointerup', 'pointercancel', 'pointerleave']) $('#jump-button').addEventListener(event, () => { flyRise = false })
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', closePanels))
$('#save-button').addEventListener('click', () => { saveWorld(); showToast('世界已保存'); closePanels() })
$('#reset-button').addEventListener('click', () => {
  if (window.confirm('要删除此浏览器中的世界存档并重新生成吗？')) {
    localStorage.removeItem(SAVE_KEY)
    localStorage.removeItem(OLD_SAVE_KEY)
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
renderer.domElement.addEventListener('click', () => {
  if (!playing || panelOpen) return
  if (currentMob) showToast(`这是${mobInfo[currentMob.kind].name}`)
  else if (currentTarget) showToast(`这是${BLOCKS.find((block) => block.id === currentTarget!.id)?.name ?? currentTarget.id}`)
})

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  keys.add(key)
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) event.preventDefault()
  if (key === ' ') jump()
  if (key === 'q') mine()
  if (key === 'e') place()
  if (key === 'f') eatFood()
  if (key === 'g') dropFromSlot(selectedIndex, false)
  if (key === 'i' && playing) panelOpen ? closePanels() : openPanel('#inventory-panel')
  if (key >= '1' && key <= '9') { selectedIndex = Number(key) - 1; renderHotbar() }
  if (key === '0') { selectedIndex = 9; renderHotbar() }
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
window.addEventListener('resize', () => {
  $('#landscape-hint').classList.toggle('hidden', window.innerWidth >= window.innerHeight || !playing || !window.matchMedia('(pointer: coarse)').matches)
})
resize()

let lastFrame = performance.now()
let saveTimer = 0
let clockTimer = 0
let hungerTimer = 0
let recoveryTimer = 0
let onlineStateTimer = 0
let fireTimer = 0
let skyTimer = 1
function animate(now: number): void {
  requestAnimationFrame(animate)
  const dt = Math.min((now - lastFrame) / 1000, 0.05)
  lastFrame = now
  if (playing && !panelOpen) {
    movePlayer(dt)
    if (onlineWorldId) {
      onlineStateTimer += dt
      if (onlineStateTimer >= 0.2) {
        onlineStateTimer = 0
        online.send({ type: 'state', x: player.x, z: player.z, foot: player.foot, yaw: player.yaw, pitch: player.pitch, dimension: world.dimension })
      }
    }
    const nextTime = timeOfDay + dt / (DAY_DURATION + NIGHT_DURATION)
    if (nextTime >= 1) day++
    timeOfDay = nextTime % 1
    saveTimer += dt
    if (saveTimer > 10) { saveTimer = 0; saveWorld() }
    const dark = world.dimension !== 'overworld' || timeOfDay >= DAY_END
    entities.tick(dt, player.x, player.z, dark, world.dimension, receiveDamage)
    fireTimer += dt
    if (fireTimer >= 1) {
      fireTimer = 0
      const px = Math.floor(player.x), pz = Math.floor(player.z)
      if ([Math.floor(player.foot), Math.floor(player.foot + 1)].some((y) => world.getBlock(px, y, pz) === 'fire')) receiveDamage(2)
    }
    for (let i = droppedItems.length - 1; i >= 0; i--) {
      const drop = droppedItems[i]
      drop.mesh.visible = drop.dimension === world.dimension
      if (!drop.mesh.visible) continue
      drop.mesh.position.set(drop.x, world.surfaceTop(Math.floor(drop.x), Math.floor(drop.z)) + 0.35 + Math.sin(now * 0.003 + i) * 0.12, drop.z)
      drop.mesh.rotation.y += dt
      if (now < drop.pickupAfter || Math.hypot(player.x - drop.x, player.z - drop.z) > 1.05) continue
      const remaining = addItem(inventory, drop.id, drop.count)
      if (remaining === drop.count) continue
      if (remaining) drop.count = remaining
      else { scene.remove(drop.mesh); drop.mesh.geometry.dispose(); (drop.mesh.material as THREE.Material).dispose(); droppedItems.splice(i, 1) }
      renderHotbar(); saveWorld(); showToast(`捡起了${itemInfo(drop.id).zh}`)
    }
    if (activeMiniGame === 'treasure' && Math.hypot(player.x - 12, player.z - 12) < 2) advanceMiniGame('treasure')
    if (mode === 'survival' || mode === 'hardcore') {
      hungerTimer += dt
      recoveryTimer += dt
      if (hungerTimer >= 45) { hungerTimer = 0; hunger = Math.max(0, hunger - 1); updateStatus() }
      if (recoveryTimer >= 10) {
        recoveryTimer = 0
        if (hunger >= 18 && health < (transform ? mobInfo[transform].health : 40)) health++
        if (hunger === 0) receiveDamage(1)
        updateStatus()
      }
    }
  }
  updateCamera()
  updateTarget()

  const solarAngle = timeOfDay < DAY_END ? timeOfDay / DAY_END * Math.PI
    : Math.PI + (timeOfDay - DAY_END) / (1 - DAY_END) * Math.PI
  const daylight = Math.max(0, Math.sin(solarAngle))
  const lightMix = Math.max(0.12, daylight)
  const sky = world.dimension === 'nether' ? new THREE.Color('#513437')
    : world.dimension === 'end' ? new THREE.Color('#312a47')
      : world.dimension === 'end_city' ? new THREE.Color('#514060')
        : nightSky.clone().lerp(daySky, lightMix)
  skyTimer += dt
  if (skyTimer >= 0.5) {
    skyTimer = 0
    const upper = world.dimension === 'overworld' ? new THREE.Color('#2364a2').lerp(nightSky, 1 - daylight) : sky.clone().multiplyScalar(0.65)
    const horizon = world.dimension === 'overworld' ? new THREE.Color('#e4ecca').lerp(nightSky, 1 - Math.max(0.1, daylight)) : sky.clone()
    const gradient = skyContext.createLinearGradient(0, 0, 0, 256)
    gradient.addColorStop(0, upper.getStyle())
    gradient.addColorStop(0.68, sky.getStyle())
    gradient.addColorStop(1, horizon.getStyle())
    skyContext.fillStyle = gradient
    skyContext.fillRect(0, 0, 512, 256)
    if (world.dimension === 'overworld' && daylight < 0.15) {
      skyContext.fillStyle = `rgba(255,255,238,${(0.15 - daylight) / 0.15 * 0.8})`
      for (let i = 0; i < 80; i++) skyContext.fillRect((i * 37 + i * i * 13) % 512, (i * 53 + i * i * 7) % 169, 1, 1)
    }
    skyTexture.needsUpdate = true
  }
  if (scene.fog) scene.fog.color.copy(sky)
  ambient.intensity = world.dimension === 'overworld' ? 0.8 + daylight * (ownedMods.has('shader') ? 2 : 1.3) : 1.4
  sunlight.intensity = world.dimension === 'overworld' ? 0.25 + daylight * 1.85 : 0.6
  sunlight.position.set(Math.cos(solarAngle) * 30, Math.sin(solarAngle) * 28, -12)
  sun.visible = world.dimension === 'overworld' && daylight > 0.05
  moon.visible = world.dimension === 'overworld' && daylight <= 0.05
  sun.position.set(player.x + Math.cos(solarAngle) * 50, Math.sin(solarAngle) * 45, player.z - 30)
  moon.position.set(player.x - Math.cos(solarAngle) * 50, -Math.sin(solarAngle) * 45, player.z - 30)
  clouds.forEach((cloud, i) => { cloud.position.x += dt * (0.15 + i * 0.01); if (cloud.position.x > 45) cloud.position.x = -45 })
  clockTimer += dt
  if (clockTimer > 0.5) {
    clockTimer = 0
    const hours = timeOfDay < DAY_END ? 6 + timeOfDay / DAY_END * 12 : 18 + (timeOfDay - DAY_END) / (1 - DAY_END) * 12
    const totalMinutes = Math.floor(hours * 60) % 1440
    $('#clock').textContent = `${timeOfDay < DAY_END ? '☀' : '☾'} 第 ${day} 天 · ${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
  }
  renderer.render(scene, camera)
}
requestAnimationFrame(animate)
