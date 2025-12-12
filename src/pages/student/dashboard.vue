<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'StudentDashboard',
  },
})

interface AcademicTerm {
  id: number
  schoolYear: string
  semester: string
  status: string
}

interface StudentSurvey {
  id: number
  title: string
  is_active: string
  survey_start?: string
  survey_end?: string
}

interface RecentActivity {
  id: number
  surveyTitle: string
  submittedAt: string
}

// State
const isLoading = ref(true)
const currentTerm = ref<AcademicTerm | null>(null)
const currentStudent = ref<any>(null)
const hasPermissionError = ref(false)
const permissionErrorMessage = ref('')

const stats = ref({
  totalSurveys: 0,
  pendingSurveys: 0,
  completedSurveys: 0,
  completionRate: 0,
})

const upcomingSurveys = ref<StudentSurvey[]>([])
const recentActivity = ref<RecentActivity[]>([])

// Fetch all dashboard data
const fetchDashboardData = async () => {
  isLoading.value = true
  try {
    await fetchCurrentStudent()
    await Promise.all([
      fetchCurrentTerm(),
      fetchStats(),
      fetchUpcomingSurveys(),
      fetchRecentActivity(),
    ])
  }
  catch (error) {
    console.error('Failed to fetch dashboard data:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Get current student from user data
const fetchCurrentStudent = async () => {
  try {
    const userData = useCookie('userData').value as any
    if (userData?.student_id) {
      currentStudent.value = userData
    }
  }
  catch (error) {
    console.error('Failed to get student data:', error)
  }
}

// Fetch current academic term
const fetchCurrentTerm = async () => {
  try {
    const res = await $api('/items/academicTerms', {
      params: {
        filter: { status: { _eq: 'Active' } },
        limit: 1,
      },
    })
    currentTerm.value = res.data?.[0] || null
  }
  catch (error) {
    console.error('Failed to fetch current term:', error)
  }
}

// Fetch stats
const fetchStats = async () => {
  try {
    const userData = useCookie('userData').value as any
    const studentId = userData?.student_id

    // Get total active surveys
    const surveysRes = await $api('/items/StudentEvaluationSurvey', {
      params: {
        filter: { is_active: { _eq: 'Active' } },
        aggregate: { count: '*' },
      },
    })
    stats.value.totalSurveys = surveysRes.data?.[0]?.count ?? 0

    // Get completed surveys by this student
    if (studentId) {
      const completedRes = await $api('/items/StudentSurveyResponses', {
        params: {
          filter: { student_id: { _eq: studentId } },
          aggregate: { count: '*' },
        },
      })
      stats.value.completedSurveys = completedRes.data?.[0]?.count ?? 0
    }

    // Calculate pending
    stats.value.pendingSurveys = Math.max(0, stats.value.totalSurveys - stats.value.completedSurveys)

    // Calculate completion rate
    if (stats.value.totalSurveys > 0) {
      stats.value.completionRate = Math.round((stats.value.completedSurveys / stats.value.totalSurveys) * 100)
    }
  }
  catch (error: any) {
    console.error('Failed to fetch stats:', error)
    if (error?.response?.status === 403 || error?.status === 403 || error?.data?.errors?.[0]?.extensions?.code === 'FORBIDDEN') {
      hasPermissionError.value = true
      permissionErrorMessage.value = 'You don\'t have permission to access survey data. Please contact your administrator to configure Directus permissions for the Student role.'
    }
  }
}

// Fetch upcoming/active surveys
const fetchUpcomingSurveys = async () => {
  try {
    const res = await $api('/items/StudentEvaluationSurvey', {
      params: {
        filter: { is_active: { _eq: 'Active' } },
        fields: ['id', 'title', 'is_active', 'survey_start', 'survey_end'],
        limit: 5,
      },
    })
    upcomingSurveys.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch upcoming surveys:', error)
    upcomingSurveys.value = []
  }
}

// Fetch recent activity
const fetchRecentActivity = async () => {
  try {
    const userData = useCookie('userData').value as any
    const studentId = userData?.student_id

    if (!studentId) {
      recentActivity.value = []

      return
    }

    const res = await $api('/items/StudentSurveyResponses', {
      params: {
        filter: { student_id: { _eq: studentId } },
        fields: ['id', 'submitted_at', 'survey_id.title'],
        sort: ['-submitted_at'],
        limit: 5,
      },
    })

    recentActivity.value = (res.data || []).map((r: any) => ({
      id: r.id,
      surveyTitle: typeof r.survey_id === 'object' ? r.survey_id.title : `Survey #${r.survey_id}`,
      submittedAt: r.submitted_at,
    }))
  }
  catch (error) {
    console.error('Failed to fetch recent activity:', error)
    recentActivity.value = []
  }
}

// Format date
const formatDate = (dateStr: string): string => {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  catch {
    return dateStr
  }
}

const router = useRouter()

const goToSurveys = () => {
  router.push('/student/surveys')
}

onMounted(() => {
  fetchDashboardData()
})
</script>

<template>
  <div>
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-6">
      <div>
        <h4 class="text-h4 mb-1">Student Dashboard</h4>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Welcome back! Here's your survey overview.
        </p>
      </div>
      <VChip v-if="currentTerm" color="primary" variant="tonal" size="large">
        <VIcon icon="ri-calendar-line" class="me-1" />
        {{ currentTerm.semester }} {{ currentTerm.schoolYear }}
      </VChip>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="d-flex justify-center align-center pa-12">
      <VProgressCircular indeterminate color="primary" size="48" />
    </div>

    <template v-else>
      <!-- Permission Error Alert -->
      <VAlert
        v-if="hasPermissionError"
        type="warning"
        variant="tonal"
        class="mb-6"
        closable
      >
        <template #title>Permission Required</template>
        {{ permissionErrorMessage }}
        <div class="mt-2 text-caption">
          In Directus, go to Settings > Roles & Permissions > Student role and grant read access to:
          <strong>StudentEvaluationSurvey</strong>, <strong>StudentSurveyResponses</strong>, <strong>academicTerms</strong>
        </div>
      </VAlert>

      <!-- Stats Cards -->
      <VRow class="mb-6">
        <VCol cols="6" md="3">
          <VCard>
            <VCardText class="d-flex align-center gap-3">
              <VAvatar size="44" color="primary" variant="tonal" rounded>
                <VIcon icon="ri-survey-line" size="24" />
              </VAvatar>
              <div>
                <div class="text-h5 font-weight-bold">{{ stats.totalSurveys }}</div>
                <div class="text-caption text-medium-emphasis">Total Surveys</div>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <VCol cols="6" md="3">
          <VCard>
            <VCardText class="d-flex align-center gap-3">
              <VAvatar size="44" color="warning" variant="tonal" rounded>
                <VIcon icon="ri-time-line" size="24" />
              </VAvatar>
              <div>
                <div class="text-h5 font-weight-bold">{{ stats.pendingSurveys }}</div>
                <div class="text-caption text-medium-emphasis">Pending</div>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <VCol cols="6" md="3">
          <VCard>
            <VCardText class="d-flex align-center gap-3">
              <VAvatar size="44" color="success" variant="tonal" rounded>
                <VIcon icon="ri-check-double-line" size="24" />
              </VAvatar>
              <div>
                <div class="text-h5 font-weight-bold">{{ stats.completedSurveys }}</div>
                <div class="text-caption text-medium-emphasis">Completed</div>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <VCol cols="6" md="3">
          <VCard>
            <VCardText class="d-flex align-center gap-3">
              <VAvatar size="44" color="info" variant="tonal" rounded>
                <VIcon icon="ri-percent-line" size="24" />
              </VAvatar>
              <div>
                <div class="text-h5 font-weight-bold">{{ stats.completionRate }}%</div>
                <div class="text-caption text-medium-emphasis">Completion Rate</div>
              </div>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

      <VRow>
        <!-- Upcoming Surveys -->
        <VCol cols="12" md="6">
          <VCard>
            <VCardTitle class="d-flex align-center justify-space-between pa-5">
              <div class="d-flex align-center">
                <VIcon icon="ri-calendar-todo-line" class="me-2" />
                Active Surveys
              </div>
              <VBtn variant="text" color="primary" size="small" @click="goToSurveys">
                View All
              </VBtn>
            </VCardTitle>

            <VDivider />

            <VCardText v-if="upcomingSurveys.length === 0" class="text-center pa-8">
              <VIcon icon="ri-inbox-line" size="48" color="medium-emphasis" class="mb-4" />
              <p class="text-body-1 text-medium-emphasis">No active surveys</p>
            </VCardText>

            <VList v-else lines="two" class="pa-0">
              <template v-for="(survey, index) in upcomingSurveys" :key="survey.id">
                <VListItem>
                  <template #prepend>
                    <VAvatar color="primary" variant="tonal" size="36">
                      <VIcon icon="ri-survey-line" size="18" />
                    </VAvatar>
                  </template>

                  <VListItemTitle class="font-weight-medium">
                    {{ survey.title }}
                  </VListItemTitle>

                  <VListItemSubtitle class="text-caption">
                    Evaluation Survey
                  </VListItemSubtitle>

                  <template #append>
                    <VChip size="small" color="success" variant="tonal">
                      Active
                    </VChip>
                  </template>
                </VListItem>

                <VDivider v-if="index < upcomingSurveys.length - 1" />
              </template>
            </VList>
          </VCard>
        </VCol>

        <!-- Recent Activity -->
        <VCol cols="12" md="6">
          <VCard>
            <VCardTitle class="d-flex align-center pa-5">
              <VIcon icon="ri-time-line" class="me-2" />
              Recent Activity
            </VCardTitle>

            <VDivider />

            <VCardText v-if="recentActivity.length === 0" class="text-center pa-8">
              <VIcon icon="ri-inbox-line" size="48" color="medium-emphasis" class="mb-4" />
              <p class="text-body-1 text-medium-emphasis">No recent activity</p>
            </VCardText>

            <VList v-else lines="two" class="pa-0">
              <template v-for="(activity, index) in recentActivity" :key="activity.id">
                <VListItem>
                  <template #prepend>
                    <VAvatar color="success" variant="tonal" size="36">
                      <VIcon icon="ri-check-line" size="18" />
                    </VAvatar>
                  </template>

                  <VListItemTitle class="text-body-2">
                    <span class="font-weight-medium">{{ activity.surveyTitle }}</span>
                  </VListItemTitle>

                  <VListItemSubtitle class="text-caption">
                    Completed survey
                  </VListItemSubtitle>

                  <template #append>
                    <span class="text-caption text-medium-emphasis">
                      {{ formatDate(activity.submittedAt) }}
                    </span>
                  </template>
                </VListItem>

                <VDivider v-if="index < recentActivity.length - 1" />
              </template>
            </VList>
          </VCard>
        </VCol>
      </VRow>
    </template>
  </div>
</template>
