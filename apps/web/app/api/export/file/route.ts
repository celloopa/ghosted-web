import { readFile } from 'node:fs/promises'
import { NextRequest, NextResponse } from 'next/server'
import { resolveExportFile } from '../../../../lib/server/resolveExportFile'

// Stream a PDF from .ghosted-local/exports/<appId>/<name>.
// ?appId=<id>&name=<resume.pdf|cover-letter.pdf>&dl=<optional-friendly-name>

export async function GET(req: NextRequest) {
  const appId = req.nextUrl.searchParams.get('appId')
  const name = req.nextUrl.searchParams.get('name')
  // Optional friendly download name — e.g. "acme-corp-resume.pdf"
  const dl = req.nextUrl.searchParams.get('dl')

  if (!appId || !name) {
    return NextResponse.json({ error: 'missing appId or name' }, { status: 400 })
  }

  let filePath: string
  try {
    filePath = resolveExportFile(appId, name)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid request'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  let bytes: Buffer
  try {
    bytes = await readFile(filePath)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return NextResponse.json({ error: 'file not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'could not read file' }, { status: 500 })
  }

  const downloadName = dl ?? name
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${downloadName}"`,
      'content-length': String(bytes.length),
    },
  })
}
