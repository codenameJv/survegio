import type { VerticalNavItems } from '@layouts/types'

export default [
  {
    title: 'Dashboard',
    to: { name: 'dashboard' },
    icon: { icon: 'ri-home-smile-line' },
  },
  {
    title: 'Academic',
    icon: { icon: 'ri-graduation-cap-line' },
    children: [
      {
        title: 'Programs',
        to: { name: 'programs' },
      },
      {
        title: 'Courses',
        to: { name: 'courses' },
      },
      {
        title: 'Class Sections',
        to: { name: 'class-sections' },
      },
      {
        title: 'Academic Terms',
        to: { name: 'academic-terms' },
      },
    ],
  },
  {
    title: 'Class & Department',
    icon: { icon: 'ri-building-line' },
    children: [
      {
        title: 'Departments',
        to: { name: 'departments' },
      },
      {
        title: 'School Offices',
        to: { name: 'school-offices' },
      },
      {
        title: 'Class List',
        to: { name: 'classes' },
      },
    ],
  },
  {
    title: 'Users',
    icon: { icon: 'ri-group-line' },
    children: [
      {
        title: 'Students',
        to: { name: 'students' },
      },
      {
        title: 'Teachers',
        to: { name: 'teachers' },
      },
    ],
  },
  {
    title: 'Survey',
    icon: { icon: 'ri-survey-line' },
    children: [
      {
        title: 'Student Evaluation',
        to: { name: 'surveys-student-evaluation' },
      },
      {
        title: 'Dean Evaluation',
        to: { name: 'surveys-dean-evaluation' },
      },
    ],
  },
] as VerticalNavItems
