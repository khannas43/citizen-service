import { getOfficerDistrictScope } from '../auth'

export default function DistrictScopeBanner({ noun = 'records' }) {
  const district = getOfficerDistrictScope()
  if (!district) return null
  return (
    <p className="muted small" style={{ margin: '0.25rem 0 0' }}>
      Showing {district} district {noun} only
    </p>
  )
}
