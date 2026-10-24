/**
 * Authenticated but Builder-role-denied guidance (FB-E5.4.3A).
 * Does not display roles, tokens, or claim payloads.
 */
import './BuilderAccessDenied.css'

export default function BuilderAccessDenied() {
  return (
    <section
      className="builder-access-denied"
      data-testid="builder-access-denied"
      aria-labelledby="builder-access-denied-title"
    >
      <h1 id="builder-access-denied-title">Form Builder unavailable</h1>
      <p role="status">
        You are signed in, but your account is not permitted to open Form Builder.
        Contact your administrator if you need Builder access.
      </p>
    </section>
  )
}
