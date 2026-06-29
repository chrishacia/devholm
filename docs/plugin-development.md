# Plugin Development Guide

This guide explains how to build your own site-owned plugins in DevHolm.

It is intentionally practical and detailed, with two examples:

- a minimal Hello World plugin
- a basic Todo List plugin

Both examples are framework-aligned but do not need to be wired into the live DevHolm runtime. You can build and test the plugin shape first, then integrate it later.

## What "Plugin" Means In DevHolm

In DevHolm, a plugin is a feature package you own under `src/user/` that can include one or more of these pieces:

- UI components
- admin pages
- API handlers
- database migrations/seeds
- config and metadata

There is no mandatory single plugin SDK object right now. Instead, plugins are composed from extension seams:

- slots
- admin extension registry
- admin page extension registry
- API extension registry
- user DB migrations
- optional view overrides

## Recommended Plugin Folder Layout

Use a clear feature-first structure:

```text
src/user/extensions/plugins/
  hello-world/
    index.ts
    manifest.ts
    components/
      HelloWorldCard.tsx
    admin/
      HelloWorldAdminPage.tsx
    api/
      helloWorld.route.ts

  todo-list/
    index.ts
    manifest.ts
    components/
      TodoListWidget.tsx
    admin/
      TodoAdminPage.tsx
    api/
      todo.route.ts
    db/
      migrations/
        u_20260629093000_create_todo_items.ts
      seeds/
        u_20260629094000_seed_todo_items.ts
```

This keeps plugin code isolated and easy to copy between sites.

## Plugin Authoring Principles

1. Keep plugin code in `src/user/**`.
2. Treat `src/core/**` as framework internals.
3. Start standalone, then register into DevHolm seams.
4. Keep each plugin independently testable.
5. Prefer additive behavior over overrides.
6. Add migrations only when data persistence is required.

## A Minimal Plugin Contract

Use a tiny local contract to keep plugins consistent:

```ts
// src/user/extensions/plugins/types.ts
export interface DevholmPluginManifest {
  id: string;
  version: string;
  name: string;
  description?: string;
  tags?: string[];
}

export interface DevholmPlugin {
  manifest: DevholmPluginManifest;
  setup?: () => void | Promise<void>;
}
```

You can evolve this later with optional fields for admin nav, routes, migrations, and feature flags.

## Example 1: Hello World Plugin

### Step 1: Create manifest

```ts
// src/user/extensions/plugins/hello-world/manifest.ts
import type { DevholmPluginManifest } from '../types';

export const helloWorldManifest: DevholmPluginManifest = {
  id: 'hello-world',
  version: '0.1.0',
  name: 'Hello World',
  description: 'Minimal plugin example.',
  tags: ['example', 'starter'],
};
```

### Step 2: Create UI component

```tsx
// src/user/extensions/plugins/hello-world/components/HelloWorldCard.tsx
import { Card, CardContent, Typography } from '@mui/material';

export default function HelloWorldCard() {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" fontWeight={700}>
          Hello from Plugin
        </Typography>
        <Typography variant="body2" color="text.secondary">
          This card is rendered by a site-owned plugin module.
        </Typography>
      </CardContent>
    </Card>
  );
}
```

### Step 3: Create plugin entry

```ts
// src/user/extensions/plugins/hello-world/index.ts
import type { DevholmPlugin } from '../types';
import { helloWorldManifest } from './manifest';

export const helloWorldPlugin: DevholmPlugin = {
  manifest: helloWorldManifest,
  setup: () => {
    console.info('[hello-world] setup complete');
  },
};
```

### Step 4: Optional integration ideas

If/when you want this in DevHolm runtime:

- register an admin nav item via `src/user/extensions/admin/index.tsx`
- register an admin page via `src/user/extensions/admin/pages.tsx`
- inject the component into a slot via `devholm.config.ts`

## Example 2: Basic Todo List Plugin

This example includes in-memory behavior first, then optional DB persistence.

### Step 1: Define types and service (standalone)

```ts
// src/user/extensions/plugins/todo-list/todo-service.ts
export interface TodoItem {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

const todos: TodoItem[] = [];

export function listTodos(): TodoItem[] {
  return [...todos];
}

export function addTodo(title: string): TodoItem {
  const item: TodoItem = {
    id: crypto.randomUUID(),
    title: title.trim(),
    done: false,
    createdAt: new Date().toISOString(),
  };
  todos.unshift(item);
  return item;
}

export function toggleTodo(id: string): TodoItem | null {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return null;
  todo.done = !todo.done;
  return todo;
}

export function removeTodo(id: string): boolean {
  const index = todos.findIndex((t) => t.id === id);
  if (index === -1) return false;
  todos.splice(index, 1);
  return true;
}
```

### Step 2: Add a simple plugin API handler

```ts
// src/user/extensions/plugins/todo-list/api/todo.route.ts
import { NextRequest, NextResponse } from 'next/server';
import { addTodo, listTodos } from '../todo-service';

export async function GET() {
  return NextResponse.json({ items: listTodos() });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const title = typeof body?.title === 'string' ? body.title : '';

  if (!title.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const item = addTodo(title);
  return NextResponse.json(item, { status: 201 });
}
```

### Step 3: Add admin page UI

```tsx
// src/user/extensions/plugins/todo-list/admin/TodoAdminPage.tsx
'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  Box,
  Button,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

interface TodoItem {
  id: string;
  title: string;
  done: boolean;
}

export default function TodoAdminPage() {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [title, setTitle] = useState('');

  const load = async () => {
    const res = await fetch('/api/plugins/todo');
    const data = await res.json();
    setItems(data.items || []);
  };

  useEffect(() => {
    load();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await fetch('/api/plugins/todo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    setTitle('');
    load();
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 2 }}>
        Todo Plugin
      </Typography>
      <Stack component="form" direction="row" spacing={1} onSubmit={onSubmit} sx={{ mb: 2 }}>
        <TextField
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          label="New task"
          fullWidth
        />
        <Button type="submit" variant="contained">
          Add
        </Button>
      </Stack>
      <List>
        {items.map((item) => (
          <ListItem key={item.id}>
            <ListItemText primary={item.title} secondary={item.done ? 'Done' : 'Open'} />
          </ListItem>
        ))}
      </List>
    </Box>
  );
}
```

### Step 4: Optional persistence with migration

```ts
// src/user/extensions/plugins/todo-list/db/migrations/u_20260629093000_create_todo_items.ts
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('todo_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('title', 220).notNullable();
    table.boolean('done').notNullable().defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('todo_items');
}
```

Use this when your plugin data must survive restarts.

## Integration Checklist (When Ready)

When you decide to connect a plugin to live DevHolm runtime:

1. Register admin nav item in `src/user/extensions/admin/index.tsx`.
2. Register admin page in `src/user/extensions/admin/pages.tsx`.
3. Register API extension route in your API extension registry.
4. If needed, register slot component in `devholm.config.ts`.
5. Add migration in `src/user/extensions/db/migrations/`.
6. Run:

```bash
pnpm typecheck
pnpm test
pnpm db:migrate
```

## Testing Guidance

- Unit test plugin services first (pure functions).
- Integration test plugin API handlers.
- Add one UI smoke test for admin page render.
- Keep plugin tests close to plugin code.

Example test locations:

- `src/user/extensions/plugins/hello-world/hello-world.test.ts`
- `src/user/extensions/plugins/todo-list/todo-service.test.ts`
- `src/user/extensions/plugins/todo-list/api/todo.route.test.ts`

## Versioning And Maintenance

- Keep semantic version in each plugin manifest.
- Record breaking plugin changes in `CHANGELOG.md`.
- Prefer introducing new plugin fields as optional.

## Common Mistakes

- Putting plugin code directly into `src/core/**`.
- Hard-coding admin routes without registry wiring.
- Coupling plugin service logic tightly to UI state.
- Creating migrations for data that can stay ephemeral.

## Quick Start Commands

```bash
pnpm devholm new:extension my-plugin
pnpm devholm list:slots
pnpm devholm new:migration create_my_plugin_tables
pnpm typecheck
pnpm test
```

If your plugin is not runtime-registered yet, these commands still help scaffold and validate code structure.
