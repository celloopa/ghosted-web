import { describe, it, expect } from 'vitest'
import type { Application } from '@ghosted/core'
import { MemoryRepo } from '../lib/repo'

function app(id: string): Application {
  return {
    id,
    company: 'Acme',
    position: 'Engineer',
    role_type: 'other',
    status: 'applied',
    events: [],
  }
}

describe('ApplicationRepo contract (MemoryRepo)', () => {
  it('upserts and lists', async () => {
    const repo = new MemoryRepo()
    await repo.upsert(app('a'))
    await repo.upsert(app('b'))
    expect((await repo.list()).map((a) => a.id)).toEqual(['a', 'b'])
  })

  it('upsert replaces by id', async () => {
    const repo = new MemoryRepo([app('a')])
    await repo.upsert({ ...app('a'), company: 'Updated' })
    const list = await repo.list()
    expect(list).toHaveLength(1)
    expect(list[0]!.company).toBe('Updated')
  })

  it('removes and replaces all', async () => {
    const repo = new MemoryRepo([app('a'), app('b')])
    await repo.remove('a')
    expect(await repo.list()).toHaveLength(1)
    await repo.replaceAll([])
    expect(await repo.list()).toHaveLength(0)
  })

  it('list returns a copy — callers cannot mutate the store', async () => {
    const repo = new MemoryRepo([app('a')])
    const list = await repo.list()
    list.pop()
    expect(await repo.list()).toHaveLength(1)
  })
})
