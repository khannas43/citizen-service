import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './screens/Home'
import ApplyForm from './screens/ApplyForm'
import ApplyPage from './screens/ApplyPage'
import CommonApplicationForm from './screens/CommonApplicationForm'
import MyFamily from './screens/MyFamily'
import MyComplaints from './screens/MyComplaints'
import MyConsents from './screens/MyConsents'
import Approvals from './screens/Approvals'
import ApprovalDetail from './screens/ApprovalDetail'
import ReportWrongDetail from './screens/ReportWrongDetail'
import MyReports from './screens/MyReports'
import PaymentsBenefits from './screens/PaymentsBenefits'
import MyRecords from './screens/MyRecords'
import MyCertificates from './screens/MyCertificates'
import NotificationHub from './screens/NotificationHub'
import ContactCentre from './screens/ContactCentre'
import LandingPage from './screens/LandingPage'
import EligibilityCheck from './screens/EligibilityCheck'
import NearbyOffices from './screens/NearbyOffices'
import SchemeDetailsPage from './screens/SchemeDetailsPage'
import OnboardingProfile from './screens/OnboardingProfile'
import LanguagePrompt from './components/LanguagePrompt'
import { shouldPromptLanguage } from './langPref'
import { verifyCitizenToken } from './auth'
import './App.css'
import './Login.css'

const PublishedFormApplication = lazy(() => import('./screens/PublishedFormApplication'))

export default function App() {
  const [authState, setAuthState] = useState('checking')
  const [showLangPrompt, setShowLangPrompt] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('citizen_token')
    if (!token) {
      setAuthState('unauthenticated')
      return
    }
    verifyCitizenToken(token)
      .then(() => {
        setAuthState('authenticated')
        setShowLangPrompt(shouldPromptLanguage())
      })
      .catch(() => {
        localStorage.removeItem('citizen_token')
        localStorage.removeItem('citizen_profile')
        setAuthState('unauthenticated')
      })
  }, [])

  if (authState === 'checking') {
    return <div className="app-boot"><p className="muted">Loading…</p></div>
  }

  if (showLangPrompt) {
    return <LanguagePrompt onDone={() => setShowLangPrompt(false)} />
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to={authState === 'authenticated' ? '/approvals' : '/'} replace />} />
      {authState === 'unauthenticated' && (
        <>
          <Route path="/" element={<LandingPage />} />
          <Route path="/eligibility-check" element={<EligibilityCheck guestShell />} />
          <Route path="/nearby-offices" element={<NearbyOffices guestShell />} />
          <Route path="/schemes/:schemeId" element={<SchemeDetailsPage guestShell />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
      {authState === 'authenticated' && (
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/approvals" replace />} />
        <Route path="/home" element={<Home />} />
        <Route path="/eligibility-check" element={<EligibilityCheck />} />
        <Route path="/nearby-offices" element={<NearbyOffices />} />
        <Route path="/schemes/:schemeId" element={<SchemeDetailsPage />} />
        <Route path="/onboarding" element={<OnboardingProfile />} />
        <Route path="/apply/caf" element={<CommonApplicationForm />} />
        <Route path="/apply" element={<ApplyPage />} />
        <Route path="/apply/caste" element={<ApplyForm service="caste" />} />
        <Route path="/apply/marriage" element={<ApplyForm service="marriage" />} />
        <Route path="/apply/pension" element={<ApplyForm service="pension" />} />
        <Route path="/apply/family-member" element={<ApplyForm service="familyMb" />} />
        <Route path="/apply/scheme" element={<ApplyForm service="scheme" />} />
        <Route
          path="/apply/:serviceId"
          element={
            <Suspense fallback={<p className="muted">Loading…</p>}>
              <PublishedFormApplication />
            </Suspense>
          }
        />
        <Route path="/my-applications" element={<Navigate to="/home" replace />} />
        <Route path="/my-family" element={<MyFamily />} />
        <Route path="/my-consents" element={<MyConsents />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/approvals/report" element={<ReportWrongDetail />} />
        <Route path="/approvals/reports" element={<MyReports />} />
        <Route path="/approvals/:key" element={<ApprovalDetail />} />
        <Route path="/grievances" element={<MyComplaints />} />
        <Route path="/my-complaints" element={<Navigate to="/grievances" replace />} />
        <Route path="/payments" element={<PaymentsBenefits />} />
        <Route path="/records" element={<MyRecords />} />
        <Route path="/utilities" element={<Navigate to="/records" replace />} />
        <Route path="/certificates" element={<MyCertificates />} />
        <Route path="/notifications" element={<NotificationHub />} />
        <Route path="/contact" element={<ContactCentre />} />
      </Route>
      )}
    </Routes>
  )
}
