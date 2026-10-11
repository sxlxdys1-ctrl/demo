import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

// Keep the source version explicit so a future data update can be reviewed.
const version = '26.1'
const require = createRequire(import.meta.url)
const packagePath = require.resolve('minecraft-data/package.json')
if (JSON.parse(readFileSync(packagePath, 'utf8')).version !== '3.117.0') throw new Error('Update the pinned minecraft-data version and review source changes first')
const source = join(dirname(packagePath), 'minecraft-data/data/pc', version)
const destination = new URL('../src/data/', import.meta.url)
const readSource = (name) => JSON.parse(readFileSync(join(source, name), 'utf8'))
const writeData = (name, value) => writeFileSync(new URL(name, destination), `${JSON.stringify(value)}\n`)

const previousItems = JSON.parse(readFileSync(new URL('items.json', destination), 'utf8'))
const sourceItems = readSource('items.json')
const sourceBlocks = readSource('blocks.json')
const sourceRecipes = readSource('recipes.json')
const idToName = new Map(sourceItems.map((item) => [item.id, item.name]))
const woods = { acacia: '金合欢木', bamboo: '竹', birch: '白桦木', cherry: '樱花木', crimson: '绯红木', dark_oak: '深色橡木', jungle: '丛林木', mangrove: '红树木', oak: '橡木', pale_oak: '苍白橡木', spruce: '云杉木', warped: '诡异木' }
const colors = { white: '白色', orange: '橙色', magenta: '品红色', light_blue: '淡蓝色', yellow: '黄色', lime: '黄绿色', pink: '粉红色', gray: '灰色', light_gray: '淡灰色', cyan: '青色', purple: '紫色', blue: '蓝色', brown: '棕色', green: '绿色', red: '红色', black: '黑色' }
const materials = { wooden: '木', stone: '石', copper: '铜', iron: '铁', golden: '金', diamond: '钻石', netherite: '下界合金' }
const newNames = {
  bush: '灌木', firefly_bush: '萤火虫灌木', short_dry_grass: '矮枯草', tall_dry_grass: '高枯草',
  golden_dandelion: '金蒲公英', wildflowers: '野花', leaf_litter: '落叶', cactus_flower: '仙人掌花',
  dried_ghast: '干涸恶魂', iron_chain: '铁链', blue_egg: '蓝色的蛋', brown_egg: '棕色的蛋',
  copper_nugget: '铜粒', music_disc_lava_chicken: '唱片：熔岩鸡', music_disc_tears: '唱片：泪',
  test_block: '测试方块', test_instance_block: '测试实例方块',
  nautilus_spawn_egg: '鹦鹉螺刷怪蛋', copper_golem_spawn_egg: '铜傀儡刷怪蛋',
  camel_husk_spawn_egg: '骆驼尸壳刷怪蛋', parched_spawn_egg: '焦枯者刷怪蛋',
  zombie_nautilus_spawn_egg: '僵尸鹦鹉螺刷怪蛋', happy_ghast_spawn_egg: '快乐恶魂刷怪蛋',
}
function newChinese(id) {
  if (newNames[id]) return newNames[id]
  for (const [wood, name] of Object.entries(woods)) if (id === `${wood}_shelf`) return `${name}架子`
  for (const [color, name] of Object.entries(colors)) if (id === `${color}_harness`) return `${name}挽具`
  for (const [material, name] of Object.entries(materials)) {
    if (id === `${material}_spear`) return `${name}矛`
    if (id === `${material}_horse_armor`) return `${name}马铠`
    if (id === `${material}_nautilus_armor`) return `${name}鹦鹉螺铠甲`
  }
  const copperTool = { sword: '剑', shovel: '锹', pickaxe: '镐', axe: '斧', hoe: '锄', helmet: '头盔', chestplate: '胸甲', leggings: '护腿', boots: '靴子' }
  if (id.startsWith('copper_') && copperTool[id.slice(7)]) return `铜${copperTool[id.slice(7)]}`
  const suffixes = { torch: '火把', bars: '栏杆', chain: '链', lightning_rod: '避雷针', lantern: '灯笼', chest: '箱子', golem_statue: '傀儡雕像' }
  for (const [state, label] of Object.entries({ waxed_exposed: '涂蜡斑驳', waxed_weathered: '涂蜡锈蚀', waxed_oxidized: '涂蜡氧化', waxed: '涂蜡', exposed: '斑驳', weathered: '锈蚀', oxidized: '氧化', '': '' })) {
    const prefix = state ? `${state}_copper_` : 'copper_'
    if (id.startsWith(prefix) && suffixes[id.slice(prefix.length)]) return `${label}铜${suffixes[id.slice(prefix.length)]}`
    const rod = state ? `${state}_lightning_rod` : ''
    if (rod && id === rod) return `${label}避雷针`
  }
  return null
}
const items = {}
for (const item of sourceItems) {
  const old = previousItems[item.name]
  items[item.name] = {
    zh: old?.zh && old.zh !== old.en ? old.zh : newChinese(item.name) ?? item.displayName,
    en: item.displayName,
    stack: item.stackSize,
    ...(item.maxDurability ? { maxDurability: item.maxDurability } : {}),
  }
}
// Old saves can contain renamed items. Keep them loadable.
for (const [id, info] of Object.entries(previousItems)) if (!items[id]) items[id] = info

const recipes = []
for (const variants of Object.values(sourceRecipes)) {
  for (const entry of variants) {
    const result = idToName.get(entry.result.id)
    if (!result) continue
    const recipe = { result, count: entry.result.count ?? 1 }
    if (entry.inShape) recipe.shape = entry.inShape.map((row) => row.map((id) => id == null ? null : idToName.get(id)))
    else if (entry.ingredients) recipe.ingredients = entry.ingredients.map((id) => idToName.get(id))
    if (recipe.shape?.some((row) => row.includes(undefined)) || recipe.ingredients?.includes(undefined)) continue
    recipes.push(recipe)
  }
}

const pickaxeTiers = {
  wooden_pickaxe: 1, golden_pickaxe: 1, stone_pickaxe: 2, copper_pickaxe: 2,
  iron_pickaxe: 3, diamond_pickaxe: 4, netherite_pickaxe: 5,
}
const blocks = []
const mining = {}
for (const block of sourceBlocks) {
  if (!items[block.name] || block.name === 'air') continue
  blocks.push(block.name)
  const material = block.material ?? ''
  const tool = material.includes('pickaxe') || material === 'incorrect_for_wooden_tool' ? 'pickaxe'
    : material.includes('shovel') ? 'shovel'
      : material.includes('axe') ? 'axe'
        : material.includes('hoe') ? 'hoe'
          : material.includes('sword') ? 'sword' : null
  const allowed = Object.keys(block.harvestTools ?? {}).map((id) => pickaxeTiers[idToName.get(Number(id))]).filter(Boolean)
  mining[block.name] = {
    ...(tool ? { tool } : {}),
    ...(tool === 'pickaxe' ? { tier: allowed.length ? Math.min(...allowed) : 1 } : {}),
    drops: (block.drops ?? []).map((id) => idToName.get(id)).filter(Boolean),
    diggable: block.diggable !== false,
  }
}

writeData('items.json', items)
writeData('recipes.json', recipes)
writeData('blocks.json', blocks)
writeData('mining.json', mining)
writeData('version.json', { edition: 'Java', version, package: 'minecraft-data@3.117.0' })
console.log(`Minecraft ${version}: ${sourceItems.length} items, ${recipes.length} recipes, ${blocks.length} placeable block IDs`)
