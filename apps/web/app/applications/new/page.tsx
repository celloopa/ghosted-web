'use client'

import { useRouter } from 'next/navigation'
import { useApps } from '../../../lib/useApps'
import { CaptureForm } from '../../../components/CaptureForm'

export default function NewApplication() {
  const { addApplication } = useApps()
  const router = useRouter()

  return (
    <div className="narrow">
      <h1 className="page-title">Add application</h1>
      <CaptureForm
        onSubmit={async (app) => {
          await addApplication(app)
          // If the user explicitly asks for materials, take them straight
          // into the apply workspace. The detail page can still link there,
          // but it should not be an extra step in this intent path.
          router.push(app.needs_materials ? `/apply?id=${app.id}` : '/applications')
        }}
      />
    </div>
  )
}
