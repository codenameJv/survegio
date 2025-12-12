<script setup lang="ts">
import VueApexCharts from 'vue3-apexcharts'
import { useTheme } from 'vuetify'
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'Dashboard',
  },
})

interface AcademicTerm {
  id: number
  schoolYear: string
  semester: string
  status: string
}

interface ResponseTrend {
  date: string
  studentCount: number
  deanCount: number
}

// State
const isLoading = ref(true)
const stats = ref({
  totalStudents: 0,
  totalTeachers: 0,
  totalClasses: 0,
  totalDepartments: 0,
  totalSurveys: 0,
  activeSurveys: 0,
  totalResponses: 0,
})

const currentTerm = ref<AcademicTerm | null>(null)
const responseTrends = ref<ResponseTrend[]>([])

const vuetifyTheme = useTheme()

// Chart options
const chartOptions = computed(() => {
  const isDark = vuetifyTheme.current.value.dark

  return {
    chart: {
      type: 'area',
      toolbar: { show: false },
      sparkline: { enabled: false },
      background: 'transparent',
    },
    colors: ['#7367F0', '#28C76F'],
    dataLabels: { enabled: false },
    stroke: {
      curve: 'smooth',
      width: 2,
    },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 0.8,
        opacityFrom: 0.5,
        opacityTo: 0.1,
      },
    },
    xaxis: {
      categories: responseTrends.value.map((t: ResponseTrend) => t.date),
      labels: {
        style: {
          colors: isDark ? '#b4b7bd' : '#6e6b7b',
          fontSize: '12px',
        },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: {
          colors: isDark ? '#b4b7bd' : '#6e6b7b',
          fontSize: '12px',
        },
        formatter: (val: number) => Math.floor(val).toString(),
      },
      min: 0,
    },
    grid: {
      borderColor: isDark ? '#3b4253' : '#e9e9e9',
      strokeDashArray: 3,
      padding: { top: -20 },
    },
    legend: {
      position: 'top',
      horizontalAlign: 'right',
      labels: {
        colors: isDark ? '#b4b7bd' : '#6e6b7b',
      },
    },
    tooltip: {
      theme: isDark ? 'dark' : 'light',
    },
  }
})

const chartSeries = computed(() => [
  {
    name: 'Student Responses',
    data: responseTrends.value.map((t: ResponseTrend) => t.studentCount),
  },
  {
    name: 'Dean Evaluations',
    data: responseTrends.value.map((t: ResponseTrend) => t.deanCount),
  },
])

// Fetch all dashboard data
const fetchDashboardData = async () => {
  isLoading.value = true
  try {
    await Promise.all([
      fetchStats(),
      fetchCurrentTerm(),
      fetchResponseTrends(),
    ])
  }
  catch (error) {
    console.error('Failed to fetch dashboard data:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Fetch response trends for the last 7 days
const fetchResponseTrends = async () => {
  try {
    // Generate last 7 days
    const days: ResponseTrend[] = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      days.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        studentCount: 0,
        deanCount: 0,
      })
    }

    // Get date 7 days ago
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const filterDate = sevenDaysAgo.toISOString()

    // Fetch student responses from last 7 days
    const studentRes = await $api('/items/StudentSurveyResponses', {
      params: {
        filter: { submitted_at: { _gte: filterDate } },
        fields: ['submitted_at'],
        limit: -1,
      },
    })

    // Count student responses by day
    for (const r of studentRes.data || []) {
      if (r.submitted_at) {
        const responseDate = new Date(r.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const dayIndex = days.findIndex(d => d.date === responseDate)
        if (dayIndex !== -1)
          days[dayIndex].studentCount++
      }
    }

    // Fetch dean responses from last 7 days
    try {
      const deanRes = await $api('/items/DeanSurveyResponses', {
        params: {
          filter: { submitted_at: { _gte: filterDate } },
          fields: ['submitted_at'],
          limit: -1,
        },
      })

      for (const r of deanRes.data || []) {
        if (r.submitted_at) {
          const responseDate = new Date(r.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          const dayIndex = days.findIndex(d => d.date === responseDate)
          if (dayIndex !== -1)
            days[dayIndex].deanCount++
        }
      }
    }
    catch {
      // Dean collection might not exist
    }

    responseTrends.value = days
  }
  catch (error) {
    console.error('Failed to fetch response trends:', error)
    // Set empty data for 7 days
    const days: ResponseTrend[] = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      days.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        studentCount: 0,
        deanCount: 0,
      })
    }
    responseTrends.value = days
  }
}

// Fetch counts
const fetchStats = async () => {
  try {
    // Fetch students count
    const studentsRes = await $api('/items/students', {
      params: { aggregate: { count: '*' } },
    })
    stats.value.totalStudents = studentsRes.data?.[0]?.count ?? 0

    // Fetch teachers count
    const teachersRes = await $api('/items/Teachers', {
      params: { aggregate: { count: '*' } },
    })
    stats.value.totalTeachers = teachersRes.data?.[0]?.count ?? 0

    // Fetch classes count
    const classesRes = await $api('/items/classes', {
      params: { aggregate: { count: '*' } },
    })
    stats.value.totalClasses = classesRes.data?.[0]?.count ?? 0

    // Fetch departments count
    const departmentsRes = await $api('/items/Department', {
      params: { aggregate: { count: '*' } },
    })
    stats.value.totalDepartments = departmentsRes.data?.[0]?.count ?? 0

    // Student Surveys
    const studentSurveysRes = await $api('/items/StudentEvaluationSurvey', {
      params: { aggregate: { count: '*' } },
    })
    const studentSurveyCount = studentSurveysRes.data?.[0]?.count ?? 0

    const activeStudentSurveysRes = await $api('/items/StudentEvaluationSurvey', {
      params: {
        filter: { is_active: { _eq: 'Active' } },
        aggregate: { count: '*' },
      },
    })
    const activeStudentCount = activeStudentSurveysRes.data?.[0]?.count ?? 0

    const studentResponsesRes = await $api('/items/StudentSurveyResponses', {
      params: { aggregate: { count: '*' } },
    })
    const studentResponseCount = studentResponsesRes.data?.[0]?.count ?? 0

    // Dean Evaluations
    let deanSurveyCount = 0
    let activeDeanCount = 0
    let deanResponseCount = 0

    try {
      const deanSurveysRes = await $api('/items/DeanEvaluationSurvey', {
        params: { aggregate: { count: '*' } },
      })
      deanSurveyCount = deanSurveysRes.data?.[0]?.count ?? 0

      const activeDeanSurveysRes = await $api('/items/DeanEvaluationSurvey', {
        params: {
          filter: { is_active: { _eq: 'Active' } },
          aggregate: { count: '*' },
        },
      })
      activeDeanCount = activeDeanSurveysRes.data?.[0]?.count ?? 0

      const deanResponsesRes = await $api('/items/DeanSurveyResponses', {
        params: { aggregate: { count: '*' } },
      })
      deanResponseCount = deanResponsesRes.data?.[0]?.count ?? 0
    }
    catch {
      // Dean collections might not exist yet
    }

    // Combined totals
    stats.value.totalSurveys = studentSurveyCount + deanSurveyCount
    stats.value.activeSurveys = activeStudentCount + activeDeanCount
    stats.value.totalResponses = studentResponseCount + deanResponseCount
  }
  catch (error) {
    console.error('Failed to fetch stats:', error)
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

onMounted(() => {
  fetchDashboardData()
})
</script>

<template>
  <div>
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-6">
      <div>
        <h4 class="text-h4 mb-1">Dashboard</h4>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Welcome to Survegio
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
      <!-- Stats Cards -->
      <VRow class="mb-6">
        <VCol cols="6" md="3">
          <VCard>
            <VCardText class="d-flex align-center gap-3">
              <VAvatar size="44" color="primary" variant="tonal" rounded>
                <VIcon icon="ri-user-line" size="24" />
              </VAvatar>
              <div>
                <div class="text-h5 font-weight-bold">{{ stats.totalStudents }}</div>
                <div class="text-caption text-medium-emphasis">Students</div>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <VCol cols="6" md="3">
          <VCard>
            <VCardText class="d-flex align-center gap-3">
              <VAvatar size="44" color="success" variant="tonal" rounded>
                <VIcon icon="ri-user-star-line" size="24" />
              </VAvatar>
              <div>
                <div class="text-h5 font-weight-bold">{{ stats.totalTeachers }}</div>
                <div class="text-caption text-medium-emphasis">Teachers</div>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <VCol cols="6" md="3">
          <VCard>
            <VCardText class="d-flex align-center gap-3">
              <VAvatar size="44" color="info" variant="tonal" rounded>
                <VIcon icon="ri-survey-line" size="24" />
              </VAvatar>
              <div>
                <div class="text-h5 font-weight-bold">{{ stats.totalSurveys }}</div>
                <div class="text-caption text-medium-emphasis">
                  Surveys
                  <span class="text-success">({{ stats.activeSurveys }} active)</span>
                </div>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <VCol cols="6" md="3">
          <VCard>
            <VCardText class="d-flex align-center gap-3">
              <VAvatar size="44" color="warning" variant="tonal" rounded>
                <VIcon icon="ri-file-list-3-line" size="24" />
              </VAvatar>
              <div>
                <div class="text-h5 font-weight-bold">{{ stats.totalResponses }}</div>
                <div class="text-caption text-medium-emphasis">Responses</div>
              </div>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

      <!-- Response Trends Chart -->
      <VRow class="mb-6">
        <VCol cols="12">
          <VCard>
            <VCardTitle class="d-flex align-center pa-5">
              <VIcon icon="ri-line-chart-line" class="me-2" />
              Response Trends
              <span class="text-caption text-medium-emphasis ms-2">(Last 7 days)</span>
            </VCardTitle>

            <VDivider />

            <VCardText class="pa-4">
              <VueApexCharts
                type="area"
                height="280"
                :options="chartOptions"
                :series="chartSeries"
              />
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

    </template>
  </div>
</template>

