import type { VerticalNavItems } from '@layouts/types'

export default [
  {
    title: 'Dashboard',
    to: { name: 'dean-dashboard' },
    icon: { icon: 'ri-dashboard-line' },
    action: 'read',
    subject: 'DeanDashboard',
  },
  {
    title: 'Surveys',
    to: { name: 'dean-surveys' },
    icon: { icon: 'ri-survey-line' },
    action: 'read',
    subject: 'DeanSurveys',
  },
] as VerticalNavItems
