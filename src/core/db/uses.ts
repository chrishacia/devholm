import { getDb } from './index';

// Types
export interface UsesCategory {
  id: string;
  title: string;
  icon: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface UsesItem {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  url: string | null;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface UsesCategoryWithItems extends UsesCategory {
  items: UsesItem[];
}

// ============================================
// PUBLIC QUERIES
// ============================================

/**
 * Get all categories with their items (for public display)
 */
export async function getAllCategoriesWithItems(): Promise<UsesCategoryWithItems[]> {
  const db = getDb();

  const categories = await db('uses_categories').orderBy('sort_order', 'asc').select('*');

  const categoriesWithItems: UsesCategoryWithItems[] = [];

  for (const category of categories) {
    const items = await db('uses_items')
      .where('category_id', category.id)
      .orderBy('sort_order', 'asc')
      .select('*');

    categoriesWithItems.push({
      ...category,
      items,
    });
  }

  return categoriesWithItems;
}

// ============================================
// CATEGORY CRUD
// ============================================

/**
 * Get all categories
 */
export async function getAllCategories(): Promise<UsesCategory[]> {
  const db = getDb();
  return db('uses_categories').orderBy('sort_order', 'asc').select('*');
}

/**
 * Get category by ID
 */
export async function getCategoryById(id: string): Promise<UsesCategory | null> {
  const db = getDb();
  const category = await db('uses_categories').where('id', id).first();
  return category || null;
}

/**
 * Create a new category
 */
export async function createCategory(
  data: Omit<UsesCategory, 'id' | 'created_at' | 'updated_at'>
): Promise<UsesCategory> {
  const db = getDb();
  const [category] = await db('uses_categories')
    .insert({
      title: data.title,
      icon: data.icon,
      sort_order: data.sort_order,
    })
    .returning('*');
  return category;
}

/**
 * Update a category
 */
export async function updateCategory(
  id: string,
  data: Partial<Omit<UsesCategory, 'id' | 'created_at' | 'updated_at'>>
): Promise<UsesCategory | null> {
  const db = getDb();
  const [category] = await db('uses_categories')
    .where('id', id)
    .update({
      ...data,
      updated_at: new Date(),
    })
    .returning('*');
  return category || null;
}

/**
 * Delete a category (cascades to items)
 */
export async function deleteCategory(id: string): Promise<boolean> {
  const db = getDb();
  const deleted = await db('uses_categories').where('id', id).delete();
  return deleted > 0;
}

// ============================================
// ITEM CRUD
// ============================================

/**
 * Get all items for a category
 */
export async function getItemsByCategory(categoryId: string): Promise<UsesItem[]> {
  const db = getDb();
  return db('uses_items').where('category_id', categoryId).orderBy('sort_order', 'asc').select('*');
}

/**
 * Get item by ID
 */
export async function getItemById(id: string): Promise<UsesItem | null> {
  const db = getDb();
  const item = await db('uses_items').where('id', id).first();
  return item || null;
}

/**
 * Create a new item
 */
export async function createItem(
  data: Omit<UsesItem, 'id' | 'created_at' | 'updated_at'>
): Promise<UsesItem> {
  const db = getDb();
  const [item] = await db('uses_items')
    .insert({
      category_id: data.category_id,
      name: data.name,
      description: data.description,
      url: data.url,
      sort_order: data.sort_order,
    })
    .returning('*');
  return item;
}

/**
 * Update an item
 */
export async function updateItem(
  id: string,
  data: Partial<Omit<UsesItem, 'id' | 'created_at' | 'updated_at'>>
): Promise<UsesItem | null> {
  const db = getDb();
  const [item] = await db('uses_items')
    .where('id', id)
    .update({
      ...data,
      updated_at: new Date(),
    })
    .returning('*');
  return item || null;
}

/**
 * Delete an item
 */
export async function deleteItem(id: string): Promise<boolean> {
  const db = getDb();
  const deleted = await db('uses_items').where('id', id).delete();
  return deleted > 0;
}

/**
 * Get all items (for admin)
 */
export async function getAllItems(): Promise<UsesItem[]> {
  const db = getDb();
  return db('uses_items').orderBy('sort_order', 'asc').select('*');
}
