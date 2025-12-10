import type { VerticalNavItems } from '@layouts/types'

export default [
  {
    title: 'Dashboard',
    to: { name: 'student-dashboard' },
    icon: { icon: 'ri-dashboard-line' },
    action: 'read',
    subject: 'StudentDashboard',
  },
  {
    title: 'Surveys',
    to: { name: 'student-surveys' },
    icon: { icon: 'ri-survey-line' },
    action: 'read',
    subject: 'StudentSurveys',
  },
] as VerticalNavItems
