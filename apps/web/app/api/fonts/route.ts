import { execFile as _execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { promisify } from 'node:util'
import { NextResponse } from 'next/server'

const execFile = promisify(_execFile)

const TYPST_BIN = process.env.GHOSTED_TYPST_BIN ?? 'typst'

function hardenedEnv(): NodeJS.ProcessEnv {
  const home = homedir()
  const extraPaths = [`${home}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin'].join(':')
  return {
    ...process.env,
    PATH: `${process.env.PATH ?? ''}:${extraPaths}`,
    HOME: process.env.HOME ?? home,
  }
}

/**
 * GET /api/fonts
 * Returns { fonts: string[] } — unique font family names known to typst, sorted,
 * capped at 200. Returns { fonts: [] } on any error (typst not found, timeout, etc.).
 */
export async function GET() {
  try {
    const env = hardenedEnv()
    const { stdout } = await execFile(TYPST_BIN, ['fonts'], { env, timeout: 5000 })
    const families = [...new Set(
      stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    )]
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 200)
    return NextResponse.json({ fonts: families })
  } catch {
    return NextResponse.json({ fonts: [] })
  }
}
