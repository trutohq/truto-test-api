import { Hono } from 'hono'
import { writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const router = new Hono()
const UPLOAD_DIR = join(process.cwd(), 'uploads')

interface FileMetadata {
  contentType: string
  originalName: string
}

router.post('/', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return c.json({ message: 'No file provided' }, 400)
    }

    const fileId = crypto.randomUUID()
    const arrayBuffer = await file.arrayBuffer()
    const filePath = join(UPLOAD_DIR, fileId)
    const metadataPath = join(UPLOAD_DIR, `${fileId}.meta.json`)

    // Write file to disk
    await writeFile(filePath, Buffer.from(arrayBuffer))

    // Write metadata
    const metadata: FileMetadata = {
      contentType: file.type || 'application/octet-stream',
      originalName: file.name,
    }
    await writeFile(metadataPath, JSON.stringify(metadata))

    return c.json({
      message: 'File uploaded successfully',
      fileId,
      filename: file.name,
      contentType: file.type,
      size: file.size,
    })
  } catch (error) {
    console.error('Error uploading file:', error)
    return c.json({ message: 'Error uploading file' }, 500)
  }
})

router.get('/:fileId', async (c) => {
  try {
    const fileId = c.req.param('fileId')
    const filePath = join(UPLOAD_DIR, fileId)
    const metadataPath = join(UPLOAD_DIR, `${fileId}.meta.json`)

    // Read metadata
    const metadataContent = await readFile(metadataPath, 'utf-8')
    const metadata: FileMetadata = JSON.parse(metadataContent)

    // Read file from disk
    const fileData = await readFile(filePath)

    return new Response(fileData, {
      headers: {
        'Content-Type': metadata.contentType,
        'Content-Disposition': `attachment; filename="${metadata.originalName}"`,
      },
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return c.json({ message: 'File not found' }, 404)
    }
    console.error('Error reading file:', error)
    return c.json({ message: 'Error reading file' }, 500)
  }
})

export default router
