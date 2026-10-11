import vanillaItems from './data/items.json'
import vanillaRecipes from './data/recipes.json'

export type ItemId = string
export type ItemStack = { id: ItemId; count: number }
export type Inventory = (ItemStack | null)[]
export type Recipe = {
  result: ItemId
  count: number
  shape?: (ItemId | null)[][]
  ingredients?: ItemId[]
  label?: string
}

type ItemInfo = { zh: string; en: string; stack: number }
const standardItems = vanillaItems as Record<string, ItemInfo>

const customItems: Record<string, ItemInfo> = {
  iron_nail: { zh: '铁钉', en: 'Iron Nail', stack: 64 },
  pistol: { zh: '无限子弹手枪', en: 'Pistol', stack: 1 },
  rifle: { zh: '重型步枪', en: 'Heavy Rifle', stack: 1 },
  endless_item: { zh: '无尽道具', en: 'Endless Item', stack: 1 },
  endless_table: { zh: '无尽工作台', en: 'Endless Table', stack: 1 },
  greedy_block: { zh: '贪婪方块', en: 'Greedy Block', stack: 64 },
  greedy_sword: { zh: '贪婪之剑', en: 'Greedy Sword', stack: 1 },
  greedy_helmet: { zh: '贪婪头盔', en: 'Greedy Helmet', stack: 1 },
  greedy_chestplate: { zh: '贪婪胸甲', en: 'Greedy Chestplate', stack: 1 },
  greedy_leggings: { zh: '贪婪护腿', en: 'Greedy Leggings', stack: 1 },
  greedy_boots: { zh: '贪婪靴子', en: 'Greedy Boots', stack: 1 },
  rainbow_table: { zh: '彩虹工作台', en: 'Rainbow Table', stack: 1 },
  sheep_wool: { zh: '羊毛', en: 'Wool', stack: 64 },
}

export const allItems: Record<string, ItemInfo> = { ...standardItems, ...customItems }

const customRecipes: Recipe[] = [
  { result: 'iron_nail', count: 8, ingredients: ['iron_ingot'] },
  { result: 'pistol', count: 1, shape: [
    ['iron_nail', 'iron_nail', 'iron_nail'],
    ['iron_nail', 'diamond', 'iron_nail'],
    ['iron_nail', 'iron_nail', 'iron_nail'],
  ] },
  { result: 'endless_item', count: 1, ingredients: ['dirt'] },
  { result: 'endless_table', count: 1, ingredients: ['oak_planks', 'endless_item'] },
  { result: 'greedy_block', count: 1, ingredients: Array(9).fill('diamond') },
  { result: 'greedy_sword', count: 1, ingredients: ['greedy_block', 'greedy_block', 'stick'] },
  { result: 'greedy_helmet', count: 1, ingredients: Array(5).fill('greedy_block') },
  { result: 'greedy_chestplate', count: 1, ingredients: Array(8).fill('greedy_block') },
  { result: 'greedy_leggings', count: 1, ingredients: Array(7).fill('greedy_block') },
  { result: 'greedy_boots', count: 1, ingredients: Array(4).fill('greedy_block') },
  { result: 'rifle', count: 1, ingredients: [
    ...Array(12).fill('iron_nail'), ...Array(4).fill('diamond'), 'pistol', 'greedy_block',
  ] },
  { result: 'rainbow_table', count: 1, ingredients: [
    ...Array(9).fill('greedy_block'), ...Array(9).fill('endless_item'),
  ] },
]

export const recipes: Recipe[] = [...vanillaRecipes as Recipe[], ...customRecipes]

export function itemInfo(id: ItemId): ItemInfo {
  return allItems[id] ?? { zh: id.replaceAll('_', ' '), en: id.replaceAll('_', ' '), stack: 64 }
}

export function emptyInventory(): Inventory {
  return Array.from({ length: 80 }, () => null)
}

export function normalizeInventory(raw: unknown): Inventory {
  const result = emptyInventory()
  if (!Array.isArray(raw)) return result
  for (let i = 0; i < Math.min(80, raw.length); i++) {
    const slot = raw[i]
    if (typeof slot === 'string' && allItems[slot]) result[i] = { id: slot, count: 64 }
    else if (slot && typeof slot === 'object' && typeof slot.id === 'string' &&
      allItems[slot.id] && Number.isInteger(slot.count) && slot.count > 0) {
      result[i] = { id: slot.id, count: Math.min(slot.count, itemInfo(slot.id).stack) }
    }
  }
  return result
}

export function countItem(inventory: Inventory, id: ItemId): number {
  return inventory.reduce((sum, slot) => sum + (slot?.id === id ? slot.count : 0), 0)
}

export function addItem(inventory: Inventory, id: ItemId, count: number): number {
  if (!allItems[id] || !Number.isSafeInteger(count) || count < 0) return count
  const limit = itemInfo(id).stack
  for (const slot of inventory) {
    if (slot?.id !== id || slot.count >= limit) continue
    const added = Math.min(limit - slot.count, count)
    slot.count += added
    count -= added
    if (count === 0) return 0
  }
  for (let i = 0; i < inventory.length; i++) {
    if (inventory[i]) continue
    const added = Math.min(limit, count)
    inventory[i] = { id, count: added }
    count -= added
    if (count === 0) return 0
  }
  return count
}

export function takeItem(inventory: Inventory, id: ItemId, count: number): boolean {
  if (!Number.isSafeInteger(count) || count < 0 || countItem(inventory, id) < count) return false
  for (let i = inventory.length - 1; i >= 0 && count > 0; i--) {
    const slot = inventory[i]
    if (slot?.id !== id) continue
    const removed = Math.min(count, slot.count)
    slot.count -= removed
    count -= removed
    if (slot.count === 0) inventory[i] = null
  }
  return true
}

export function recipeNeeds(recipe: Recipe): Map<ItemId, number> {
  const needs = new Map<ItemId, number>()
  for (const id of recipe.ingredients ?? recipe.shape?.flat().filter((id): id is ItemId => !!id) ?? []) {
    needs.set(id, (needs.get(id) ?? 0) + 1)
  }
  return needs
}

export function recipeSize(recipe: Recipe): number {
  return [...recipeNeeds(recipe).values()].reduce((sum, count) => sum + count, 0)
}

export function canCraft(inventory: Inventory, recipe: Recipe, capacity: number): boolean {
  if (recipeSize(recipe) > capacity) return false
  for (const [id, count] of recipeNeeds(recipe)) if (countItem(inventory, id) < count) return false
  const test = inventory.map((slot) => slot ? { ...slot } : null)
  for (const [id, count] of recipeNeeds(recipe)) takeItem(test, id, count)
  return addItem(test, recipe.result, recipe.count) === 0
}

export function craft(inventory: Inventory, recipe: Recipe, capacity: number): boolean {
  if (!canCraft(inventory, recipe, capacity)) return false
  for (const [id, count] of recipeNeeds(recipe)) takeItem(inventory, id, count)
  addItem(inventory, recipe.result, recipe.count)
  return true
}

export function searchItems(query: string, maxResults = 60): ItemId[] {
  const text = query.trim().toLowerCase()
  if (!text) return Object.keys(customItems).concat(Object.keys(standardItems).slice(0, maxResults)).slice(0, maxResults)
  return Object.entries(allItems)
    .filter(([id, info]) => id.includes(text) || info.en.toLowerCase().includes(text) || info.zh.includes(text))
    .slice(0, maxResults).map(([id]) => id)
}
