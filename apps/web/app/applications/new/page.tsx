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
          // Materials-needed lands on its detail page (the future apply
          // workspace); everything else goes back to the list.
          router.push(app.needs_materials ? `/applications/${app.id}` : '/applications')
        }}
      />
    </div>
  )
}
