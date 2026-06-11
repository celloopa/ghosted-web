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
          router.push('/applications')
        }}
      />
    </div>
  )
}
