<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'surveys',
  },
})

interface DeanQuestion {
  id: number
  question: string
  sort?: number
}

interface DeanQuestionGroup {
  id: number
  number: number
  title: string
  response_style: string
  questions?: DeanQuestion[]
}

interface DeanSurvey {
  id: number
  title: string
  description: string
  survey_type: 'faculty_evaluation' | 'program_assessment'
  question_groups?: DeanQuestionGroup[]
}

interface DeanSurveyAnswer {
  id: number
  question_id: number | DeanQuestion
  answer_value: string
}

interface DeanSurveyResponse {
  id: number
  survey_id: number
  dean_id: { id: number; first_name: string; last_name: string } | number
  evaluated_teacher_id?: { id: number; first_name: string; last_name: string } | number | null
  department_id?: { id: number; name: { programCode: string; programName: string } } | number | null
  submitted_at: string
  answers?: DeanSurveyAnswer[]
}

const route = useRoute()
const router = useRouter()

const surveyId = computed(() => Number((route.params as { id: string }).id))

// State
const isLoading = ref(true)
const survey = ref<DeanSurvey | null>(null)
const responses = ref<DeanSurveyResponse[]>([])
const search = ref('')
const expandedRows = ref<number[]>([])

// Get all questions as flat array
const allQuestions = computed(() => {
  if (!survey.value?.question_groups) return []
  const questions: { question: DeanQuestion; responseStyle: string; groupNumber: number; groupTitle: string }[] = []
  for (const group of survey.value.question_groups) {
    for (const q of group.questions || []) {
      questions.push({
        question: q,
        responseStyle: group.response_style,
        groupNumber: group.number,
        groupTitle: group.title,
      })
    }
  }
  return questions
})

// Filtered responses
const filteredResponses = computed(() => {
  if (!search.value.trim()) return responses.value

  const searchTerm = search.value.toLowerCase().trim()
  return responses.value.filter(response => {
    const deanName = getDeanName(response).toLowerCase()
    const teacherName = getEvaluatedTeacher(response).toLowerCase()
    return deanName.includes(searchTerm) || teacherName.includes(searchTerm)
  })
})

// Format date for display
const formatDateDisplay = (dateStr: string): string => {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
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

// Get dean name
const getDeanName = (response: DeanSurveyResponse): string => {
  if (typeof response.dean_id === 'object' && response.dean_id !== null) {
    return `${response.dean_id.last_name}, ${response.dean_id.first_name}`
  }
  return `Dean #${response.dean_id}`
}

// Get evaluated teacher name
const getEvaluatedTeacher = (response: DeanSurveyResponse): string => {
  if (!response.evaluated_teacher_id) return '-'
  if (typeof response.evaluated_teacher_id === 'object' && response.evaluated_teacher_id !== null) {
    return `${response.evaluated_teacher_id.last_name}, ${response.evaluated_teacher_id.first_name}`
  }
  return `Teacher #${response.evaluated_teacher_id}`
}

// Get department name
const getDepartment = (response: DeanSurveyResponse): string => {
  if (!response.department_id) return '-'
  if (typeof response.department_id === 'object' && response.department_id !== null) {
    if (typeof response.department_id.name === 'object' && response.department_id.name !== null) {
      return response.department_id.name.programCode
    }
  }
  return '-'
}

// Get answer for a specific question
const getAnswerForQuestion = (response: DeanSurveyResponse, questionId: number): string => {
  if (!response.answers) return '-'
  const answer = response.answers.find(a => {
    const answerQuestionId = typeof a.question_id === 'object' ? a.question_id.id : a.question_id
    return answerQuestionId === questionId
  })
  return answer?.answer_value || '-'
}

// Get answer color based on value and response style
const getAnswerColor = (value: string, responseStyle: string): string => {
  if (responseStyle === 'Likert-Scale Questions' || responseStyle === 'Rating-Scale Questions') {
    const num = parseFloat(value)
    if (!isNaN(num)) {
      if (num >= 4) return 'success'
      if (num >= 3) return 'warning'
      return 'error'
    }
  }
  if (responseStyle === 'Ranking Questions') {
    return 'primary'
  }
  if (responseStyle === 'Multiple-Choice Questions') {
    return 'info'
  }
  if (responseStyle === 'Demographic/Context Questions') {
    return 'secondary'
  }
  return 'default'
}

// Toggle row expansion
const toggleRow = (responseId: number) => {
  const index = expandedRows.value.indexOf(responseId)
  if (index === -1) {
    expandedRows.value.push(responseId)
  }
  else {
    expandedRows.value.splice(index, 1)
  }
}

// Check if row is expanded
const isExpanded = (responseId: number): boolean => {
  return expandedRows.value.includes(responseId)
}

// Fetch survey details
const fetchSurvey = async () => {
  try {
    const res = await $api(`/items/DeanEvaluationSurvey/${surveyId.value}`, {
      params: {
        fields: ['id', 'title', 'description', 'survey_type', 'question_groups.*', 'question_groups.questions.*'],
      },
    })
    survey.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch survey:', error)
  }
}

// Fetch survey responses
const fetchResponses = async () => {
  try {
    const res = await $api('/items/DeanSurveyResponse', {
      params: {
        filter: { survey_id: { _eq: surveyId.value } },
        fields: ['*', 'dean_id.*', 'evaluated_teacher_id.*', 'department_id.*', 'department_id.name.*', 'answers.*', 'answers.question_id.*'],
        sort: ['-submitted_at'],
      },
    })
    responses.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch responses:', error)
    responses.value = []
  }
}

// Go back
const goBack = () => {
  router.push(`/surveys/dean/${surveyId.value}`)
}

// Export to CSV
const exportToCSV = () => {
  if (!survey.value || responses.value.length === 0) return

  const isFacultyEval = survey.value.survey_type === 'faculty_evaluation'
  const headers = [
    'Dean Name',
    ...(isFacultyEval ? ['Evaluated Teacher'] : ['Department']),
    'Submitted At',
    ...allQuestions.value.map(q => q.question.question),
  ]

  const rows = responses.value.map(response => [
    getDeanName(response),
    ...(isFacultyEval ? [getEvaluatedTeacher(response)] : [getDepartment(response)]),
    formatDateDisplay(response.submitted_at),
    ...allQuestions.value.map(q => getAnswerForQuestion(response, q.question.id)),
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${survey.value.title}_responses.csv`
  link.click()
}

// Load data
onMounted(async () => {
  isLoading.value = true
  await Promise.all([fetchSurvey(), fetchResponses()])
  isLoading.value = false
})
</script>

<template>
  <div>
    <!-- Loading State -->
    <VCard v-if="isLoading">
      <VCardText class="d-flex justify-center align-center pa-12">
        <VProgressCircular indeterminate color="primary" />
        <span class="ms-4">Loading responses...</span>
      </VCardText>
    </VCard>

    <!-- Main Content -->
    <template v-else>
      <VCard>
        <VCardTitle class="pa-6">
          <div class="d-flex align-center justify-space-between flex-wrap gap-4">
            <div class="d-flex align-center">
              <VBtn icon variant="text" class="me-2" @click="goBack">
                <VIcon icon="ri-arrow-left-line" />
              </VBtn>
              <VIcon icon="ri-bar-chart-line" size="28" class="me-3" />
              <div>
                <span class="text-h5">Evaluation Responses</span>
                <p class="text-body-2 text-medium-emphasis mb-0">{{ survey?.title }}</p>
              </div>
            </div>
            <div class="d-flex align-center gap-2">
              <VTextField
                v-model="search"
                prepend-inner-icon="ri-search-line"
                placeholder="Search..."
                density="compact"
                variant="outlined"
                hide-details
                style="min-width: 200px;"
              />
              <VBtn
                color="success"
                variant="outlined"
                prepend-icon="ri-download-line"
                :disabled="responses.length === 0"
                @click="exportToCSV"
              >
                Export CSV
              </VBtn>
            </div>
          </div>
        </VCardTitle>

        <VDivider />

        <!-- Stats Summary -->
        <VCardText class="pa-4 bg-grey-lighten-5">
          <VRow dense>
            <VCol cols="auto">
              <VChip color="primary" variant="tonal">
                <VIcon icon="ri-user-line" class="me-1" />
                {{ responses.length }} Responses
              </VChip>
            </VCol>
            <VCol cols="auto">
              <VChip color="info" variant="tonal">
                <VIcon icon="ri-question-line" class="me-1" />
                {{ allQuestions.length }} Questions
              </VChip>
            </VCol>
            <VCol cols="auto">
              <VChip :color="survey?.survey_type === 'faculty_evaluation' ? 'info' : 'warning'" variant="tonal">
                {{ survey?.survey_type === 'faculty_evaluation' ? 'Faculty Evaluation' : 'Program Assessment' }}
              </VChip>
            </VCol>
          </VRow>
        </VCardText>

        <VDivider />

        <!-- No Responses -->
        <VCardText v-if="responses.length === 0" class="text-center pa-12">
          <VIcon icon="ri-inbox-line" size="64" color="medium-emphasis" class="mb-4" />
          <p class="text-h6 text-medium-emphasis mb-2">No Responses Yet</p>
          <p class="text-body-2 text-medium-emphasis">
            When deans submit their evaluations, you'll see them here.
          </p>
        </VCardText>

        <!-- Responses Table -->
        <VTable v-else density="comfortable">
          <thead>
            <tr>
              <th style="width: 50px;" />
              <th>Dean</th>
              <th v-if="survey?.survey_type === 'faculty_evaluation'">Evaluated Teacher</th>
              <th v-else>Department</th>
              <th>Submitted At</th>
              <th class="text-center">Answers</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="response in filteredResponses" :key="response.id">
              <tr
                class="cursor-pointer"
                :class="{ 'bg-grey-lighten-5': isExpanded(response.id) }"
                @click="toggleRow(response.id)"
              >
                <td>
                  <VBtn icon variant="text" size="small">
                    <VIcon :icon="isExpanded(response.id) ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'" />
                  </VBtn>
                </td>
                <td>
                  <div class="d-flex align-center gap-2">
                    <VAvatar size="32" color="primary" variant="tonal">
                      <span class="text-body-2">{{ getDeanName(response).charAt(0) }}</span>
                    </VAvatar>
                    <span class="font-weight-medium">{{ getDeanName(response) }}</span>
                  </div>
                </td>
                <td v-if="survey?.survey_type === 'faculty_evaluation'">
                  {{ getEvaluatedTeacher(response) }}
                </td>
                <td v-else>
                  {{ getDepartment(response) }}
                </td>
                <td>{{ formatDateDisplay(response.submitted_at) }}</td>
                <td class="text-center">
                  <VChip size="small" color="info" variant="tonal">
                    {{ response.answers?.length || 0 }}
                  </VChip>
                </td>
              </tr>

              <!-- Expanded Row with Answers -->
              <tr v-if="isExpanded(response.id)">
                <td colspan="5" class="pa-0">
                  <VCard variant="flat" color="grey-lighten-5" class="ma-4 mt-0">
                    <VCardText class="pa-4">
                      <p class="text-subtitle-2 font-weight-bold mb-3">Answers</p>
                      <VRow dense>
                        <VCol
                          v-for="q in allQuestions"
                          :key="q.question.id"
                          cols="12"
                          md="6"
                        >
                          <VCard variant="outlined" class="mb-2">
                            <VCardText class="pa-3">
                              <div class="d-flex align-center justify-space-between mb-1">
                                <span class="text-caption text-medium-emphasis">
                                  Group {{ q.groupNumber }}{{ q.groupTitle ? ` - ${q.groupTitle}` : '' }}
                                </span>
                                <VChip size="x-small" variant="tonal">
                                  {{ q.responseStyle }}
                                </VChip>
                              </div>
                              <p class="text-body-2 mb-2">{{ q.question.question }}</p>
                              <VChip
                                :color="getAnswerColor(getAnswerForQuestion(response, q.question.id), q.responseStyle)"
                                variant="tonal"
                                size="small"
                              >
                                {{ getAnswerForQuestion(response, q.question.id) }}
                              </VChip>
                            </VCardText>
                          </VCard>
                        </VCol>
                      </VRow>
                    </VCardText>
                  </VCard>
                </td>
              </tr>
            </template>
          </tbody>
        </VTable>

        <!-- No Search Results -->
        <VCardText v-if="filteredResponses.length === 0 && responses.length > 0" class="text-center pa-8">
          <VIcon icon="ri-search-line" size="48" color="medium-emphasis" class="mb-4" />
          <p class="text-body-1 text-medium-emphasis">
            No responses found matching "{{ search }}"
          </p>
        </VCardText>
      </VCard>
    </template>
  </div>
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}

.cursor-pointer:hover {
  background-color: rgba(var(--v-theme-primary), 0.04);
}
</style>
