<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'DeanSurveys',
  },
})

// ==================== INTERFACES ====================

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
  instruction?: string
  survey_type: string
  is_active: string
  survey_start?: string
  survey_end?: string
  question_groups?: DeanQuestionGroup[]
  assigned_deans?: any[]
}

interface Teacher {
  id: number
  first_name: string
  last_name: string
  position?: string
  Department?: any[]
}

interface CompletedResponse {
  id: number
  survey_id: number
  surveyTitle: string
  surveyType: string
  teacherId?: number
  teacherName?: string
  submitted_at: string
}

interface PendingEvaluation {
  survey: DeanSurvey
  teacher?: Teacher
  isCompleted: boolean
}

// ==================== STATE ====================

const isLoading = ref(true)
const activeTab = ref('pending')
const pendingEvaluations = ref<PendingEvaluation[]>([])
const completedResponses = ref<CompletedResponse[]>([])
const allTeachers = ref<Teacher[]>([])
const hasPermissionError = ref(false)

// View response dialog
const showViewDialog = ref(false)
const viewingResponse = ref<CompletedResponse | null>(null)
const viewingAnswers = ref<any[]>([])
const isLoadingAnswers = ref(false)

// Snackbar
const snackbar = ref({
  show: false,
  message: '',
  color: 'success',
})

// ==================== COMPUTED ====================

const pendingCount = computed(() => pendingEvaluations.value.filter((e: PendingEvaluation) => !e.isCompleted).length)
const completedCount = computed(() => completedResponses.value.length)



// ==================== FETCH FUNCTIONS ====================

const fetchData = async () => {
  isLoading.value = true
  hasPermissionError.value = false
  try {
    await Promise.all([
      fetchTeachers(),
      fetchPendingEvaluations(),
      fetchCompletedResponses(),
    ])
  }
  catch (error: any) {
    console.error('Failed to fetch data:', error)
    if (error?.data?.errors?.[0]?.extensions?.code === 'FORBIDDEN') {
      hasPermissionError.value = true
    }
  }
  finally {
    isLoading.value = false
  }
}

// Fetch all professors in dean's department (for faculty evaluations)
const fetchTeachers = async () => {
  try {
    const userData = useCookie('userData').value as any
    const departmentId = userData?.department_id

    if (!departmentId) {
      console.warn('No department_id found for dean')
      allTeachers.value = []
      return
    }

    // Fetch department to get teacher IDs
    const deptRes = await $api(`/items/Department/${departmentId}`, {
      params: {
        fields: ['id', 'teacher_id.*'],
      },
    })

    const teacherIds = (deptRes.data?.teacher_id || []).map((t: any) => {
      if (typeof t === 'number') return t
      return t.Teachers_id || t.id
    }).filter((id: any) => id != null)

    if (teacherIds.length === 0) {
      allTeachers.value = []
      return
    }

    // Fetch professors from the department
    const res = await $api('/items/Teachers', {
      params: {
        filter: {
          _and: [
            { id: { _in: teacherIds } },
            { position: { _eq: 'Professor' } },
            { is_active: { _eq: 'Active' } },
          ],
        },
        fields: ['id', 'first_name', 'last_name', 'position'],
      },
    })
    allTeachers.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch teachers:', error)
    allTeachers.value = []
  }
}

// Fetch pending evaluations
const fetchPendingEvaluations = async () => {
  try {
    const userData = useCookie('userData').value as any
    const deanId = userData?.dean_id

    if (!deanId) {
      pendingEvaluations.value = []
      return
    }

    // Fetch all active surveys assigned to this dean
    const res = await $api('/items/DeanEvaluationSurvey', {
      params: {
        filter: { is_active: { _eq: 'Active' } },
        fields: [
          '*',
          'assigned_deans.*',
          'question_groups.*',
          'question_groups.questions.*',
        ],
      },
    })

    const allSurveys: DeanSurvey[] = res.data || []

    // Filter surveys where this dean is in the assigned_deans array
    const assignedSurveys = allSurveys.filter(survey => {
      if (!survey.assigned_deans || !Array.isArray(survey.assigned_deans) || survey.assigned_deans.length === 0) {
        return false
      }
      return survey.assigned_deans.some((assignment: any) => {
        const assignedId = typeof assignment.Teachers_id === 'object'
          ? assignment.Teachers_id?.id
          : assignment.Teachers_id || assignment.dean_id || assignment.id
        return assignedId === deanId
      })
    })

    // Get completed responses for this dean (survey_id + evaluated_teacher_id combinations)
    interface CompletedEvaluation {
      surveyId: number
      teacherId: number | null
    }
    let completedEvaluations: CompletedEvaluation[] = []
    try {
      const completedRes = await $api('/items/DeanSurveyResponses', {
        params: {
          filter: { dean_id: { _eq: deanId } },
          fields: ['survey_id', 'evaluated_teacher_id'],
        },
      })
      completedEvaluations = (completedRes.data || []).map((r: any) => ({
        surveyId: typeof r.survey_id === 'object' ? r.survey_id?.id : r.survey_id,
        teacherId: typeof r.evaluated_teacher_id === 'object' ? r.evaluated_teacher_id?.id : r.evaluated_teacher_id,
      }))
    }
    catch (err) {
      console.error('Failed to fetch completed responses:', err)
    }

    // Build pending evaluations - one entry per survey + teacher combination
    const evaluations: PendingEvaluation[] = []

    for (const survey of assignedSurveys) {
      // For faculty evaluations, create one entry per teacher in department
      if (survey.survey_type === 'faculty_evaluation' || survey.survey_type === 'Faculty Evaluation') {
        for (const teacher of allTeachers.value) {
          // Check if this survey + teacher combination is already completed
          const isCompleted = completedEvaluations.some(
            c => c.surveyId === survey.id && c.teacherId === teacher.id,
          )
          if (!isCompleted) {
            evaluations.push({
              survey,
              teacher,
              isCompleted: false,
            })
          }
        }
      }
      else {
        // For non-faculty evaluations (program assessment), just one entry per survey
        const isCompleted = completedEvaluations.some(c => c.surveyId === survey.id)
        if (!isCompleted) {
          evaluations.push({
            survey,
            teacher: undefined,
            isCompleted: false,
          })
        }
      }
    }

    pendingEvaluations.value = evaluations
  }
  catch (error) {
    console.error('Failed to fetch pending evaluations:', error)
    pendingEvaluations.value = []
  }
}

// Fetch completed responses
const fetchCompletedResponses = async () => {
  try {
    const userData = useCookie('userData').value as any
    const deanId = userData?.dean_id

    if (!deanId) {
      completedResponses.value = []
      return
    }

    const res = await $api('/items/DeanSurveyResponses', {
      params: {
        filter: { dean_id: { _eq: deanId } },
        fields: ['id', 'survey_id.id', 'survey_id.title', 'survey_id.survey_type', 'evaluated_teacher_id.id', 'evaluated_teacher_id.first_name', 'evaluated_teacher_id.last_name', 'submitted_at'],
        sort: ['-submitted_at'],
      },
    })

    completedResponses.value = (res.data || []).map((r: any) => {
      const teacher = r.evaluated_teacher_id
      return {
        id: r.id,
        survey_id: typeof r.survey_id === 'object' ? r.survey_id.id : r.survey_id,
        surveyTitle: typeof r.survey_id === 'object' ? r.survey_id.title : `Survey #${r.survey_id}`,
        surveyType: typeof r.survey_id === 'object' ? r.survey_id.survey_type : '',
        teacherId: teacher && typeof teacher === 'object' ? teacher.id : teacher,
        teacherName: teacher && typeof teacher === 'object' ? `${teacher.first_name} ${teacher.last_name}` : undefined,
        submitted_at: r.submitted_at,
      }
    })
  }
  catch (error) {
    console.error('Failed to fetch completed responses:', error)
    completedResponses.value = []
  }
}

// Navigate to survey page
const router = useRouter()

const openSurvey = (evaluation: PendingEvaluation) => {
  // Include teacher ID in query params for faculty evaluations
  if (evaluation.teacher) {
    router.push(`/dean/surveys-${evaluation.survey.id}?teacher=${evaluation.teacher.id}`)
  }
  else {
    router.push(`/dean/surveys-${evaluation.survey.id}`)
  }
}

// Get teacher full name
const getTeacherName = (teacher?: Teacher): string => {
  if (!teacher) return '-'
  return `${teacher.first_name} ${teacher.last_name}`
}

// ==================== VIEW RESPONSE ====================

const viewResponse = async (response: CompletedResponse) => {
  viewingResponse.value = response
  viewingAnswers.value = []
  showViewDialog.value = true
  isLoadingAnswers.value = true

  try {
    // Fetch the response with nested answers (matching admin page format)
    const res = await $api(`/items/DeanSurveyResponses/${response.id}`, {
      params: {
        fields: ['*', 'dean_id.*', 'evaluated_teacher_id.*', 'answers.*', 'answers.question_id.*'],
      },
    })
    viewingAnswers.value = res.data?.answers || []
  }
  catch (error) {
    console.error('Failed to fetch answers:', error)
    snackbar.value = { show: true, message: 'Failed to load response details', color: 'error' }
  }
  finally {
    isLoadingAnswers.value = false
  }
}

// ==================== HELPERS ====================

const formatDate = (dateStr: string): string => {
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


const getSurveyTypeLabel = (type: string): string => {
  const isFaculty = type === 'Faculty Evaluation' || type === 'faculty_evaluation'
  return isFaculty ? 'Faculty Evaluation' : 'Program Assessment'
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div>
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-6">
      <div>
        <h4 class="text-h4 mb-1">My Evaluations</h4>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Complete your pending evaluations and view your submission history
        </p>
      </div>
      <VBtn
        variant="tonal"
        color="primary"
        :loading="isLoading"
        @click="fetchData"
      >
        <VIcon icon="ri-refresh-line" class="me-1" />
        Refresh
      </VBtn>
    </div>

    <!-- Permission Error Alert -->
    <VAlert
      v-if="hasPermissionError"
      type="warning"
      variant="tonal"
      class="mb-6"
      closable
    >
      <template #title>Permission Required</template>
      You don't have permission to access evaluation data. Please contact your administrator to configure Directus permissions for the Dean role.
    </VAlert>

    <!-- Loading State -->
    <VCard v-if="isLoading">
      <VCardText class="d-flex justify-center align-center pa-12">
        <VProgressCircular indeterminate color="primary" />
        <span class="ms-4">Loading evaluations...</span>
      </VCardText>
    </VCard>

    <template v-else>
      <VCard>
        <VTabs v-model="activeTab" grow>
          <VTab value="pending">
            <VIcon icon="ri-time-line" class="me-2" />
            Pending
            <VBadge
              v-if="pendingCount > 0"
              :content="pendingCount"
              color="warning"
              inline
              class="ms-2"
            />
          </VTab>
          <VTab value="completed">
            <VIcon icon="ri-check-double-line" class="me-2" />
            Completed
            <VBadge
              v-if="completedCount > 0"
              :content="completedCount"
              color="success"
              inline
              class="ms-2"
            />
          </VTab>
        </VTabs>

        <VDivider />

        <VWindow v-model="activeTab">
          <!-- Pending Evaluations -->
          <VWindowItem value="pending">
            <VCardText v-if="pendingCount === 0" class="text-center pa-12">
              <VIcon icon="ri-checkbox-circle-line" size="64" color="success" class="mb-4" />
              <p class="text-h6 text-medium-emphasis mb-2">All caught up!</p>
              <p class="text-body-2 text-medium-emphasis">You have no pending evaluations.</p>
            </VCardText>

            <template v-else>
              <VTable>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Faculty Member</th>
                    <th>Type</th>
                    <th>Questions</th>
                    <th class="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(evaluation, index) in pendingEvaluations.filter(e => !e.isCompleted)" :key="`${evaluation.survey.id}-${evaluation.teacher?.id || index}`">
                    <td>{{ evaluation.survey.title }}</td>
                    <td>{{ getTeacherName(evaluation.teacher) }}</td>
                    <td>{{ getSurveyTypeLabel(evaluation.survey.survey_type) }}</td>
                    <td>{{ evaluation.survey.question_groups?.reduce((acc, g) => acc + (g.questions?.length || 0), 0) || 0 }}</td>
                    <td class="text-center">
                      <VBtn
                        color="primary"
                        size="small"
                        @click="openSurvey(evaluation)"
                      >
                        Evaluate
                      </VBtn>
                    </td>
                  </tr>
                </tbody>
              </VTable>
            </template>
          </VWindowItem>

          <!-- Completed Responses -->
          <VWindowItem value="completed">
            <VCardText v-if="completedResponses.length === 0" class="text-center pa-12">
              <VIcon icon="ri-inbox-line" size="64" color="medium-emphasis" class="mb-4" />
              <p class="text-h6 text-medium-emphasis mb-2">No completed evaluations</p>
              <p class="text-body-2 text-medium-emphasis">Your completed evaluations will appear here.</p>
            </VCardText>

            <VDataTable
              v-else
              :headers="[
                { title: 'Survey', key: 'surveyTitle', sortable: true },
                { title: 'Type', key: 'surveyType', sortable: true },
                { title: 'Teacher Evaluated', key: 'teacherName', sortable: true },
                { title: 'Submitted', key: 'submitted_at', sortable: true },
                { title: 'Actions', key: 'actions', sortable: false, align: 'center' },
              ]"
              :items="completedResponses"
              :items-per-page="10"
              hover
            >
              <template #[`item.surveyTitle`]="{ item }">
                <div class="d-flex align-center gap-2">
                  <VAvatar size="32" color="success" variant="tonal">
                    <VIcon icon="ri-check-line" size="16" />
                  </VAvatar>
                  <span class="font-weight-medium">{{ item.surveyTitle }}</span>
                </div>
              </template>

              <template #[`item.surveyType`]="{ item }">
                {{ getSurveyTypeLabel(item.surveyType) }}
              </template>

              <template #[`item.teacherName`]="{ item }">
                {{ item.teacherName || '-' }}
              </template>

              <template #[`item.submitted_at`]="{ item }">
                {{ formatDate(item.submitted_at) }}
              </template>

              <template #[`item.actions`]="{ item }">
                <VBtn
                  icon
                  variant="text"
                  size="small"
                  color="primary"
                  @click="viewResponse(item)"
                >
                  <VIcon icon="ri-eye-line" />
                  <VTooltip activator="parent" location="top">View Response</VTooltip>
                </VBtn>
              </template>
            </VDataTable>
          </VWindowItem>
        </VWindow>
      </VCard>
    </template>

    <!-- View Response Dialog -->
    <VDialog v-model="showViewDialog" max-width="700" scrollable>
      <VCard v-if="viewingResponse">
        <VCardTitle class="d-flex align-center pa-5">
          <VIcon icon="ri-file-text-line" class="me-2" />
          Response Details
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-5">
          <div class="mb-4">
            <p class="text-subtitle-2 text-medium-emphasis mb-1">Survey</p>
            <p class="text-body-1 font-weight-medium">{{ viewingResponse.surveyTitle }}</p>
          </div>

          <div v-if="viewingResponse.teacherName" class="mb-4">
            <p class="text-subtitle-2 text-medium-emphasis mb-1">Teacher Evaluated</p>
            <p class="text-body-1">{{ viewingResponse.teacherName }}</p>
          </div>

          <div class="mb-4">
            <p class="text-subtitle-2 text-medium-emphasis mb-1">Submitted</p>
            <p class="text-body-1">{{ formatDate(viewingResponse.submitted_at) }}</p>
          </div>

          <VDivider class="my-4" />

          <p class="text-subtitle-1 font-weight-bold mb-4">Answers</p>

          <div v-if="isLoadingAnswers" class="text-center pa-4">
            <VProgressCircular indeterminate size="32" />
          </div>

          <div v-else-if="viewingAnswers.length === 0" class="text-center pa-4 text-medium-emphasis">
            No answers found
          </div>

          <div v-else>
            <div v-for="(answer, index) in viewingAnswers" :key="answer.id" class="mb-4">
              <div class="d-flex align-center mb-2">
                <VAvatar color="primary" size="24" class="me-2">
                  <span class="text-caption">{{ index + 1 }}</span>
                </VAvatar>
                <span class="text-body-2 font-weight-medium">
                  {{ typeof answer.question_id === 'object' ? answer.question_id.question : `Question #${answer.question_id}` }}
                </span>
              </div>
              <div class="ms-8">
                <VChip color="success" variant="tonal" size="small">
                  {{ answer.answer_value }}
                </VChip>
              </div>
            </div>
          </div>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="showViewDialog = false">
            Close
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Snackbar -->
    <VSnackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="4000"
      location="top"
    >
      {{ snackbar.message }}
      <template #actions>
        <VBtn variant="text" @click="snackbar.show = false">
          Close
        </VBtn>
      </template>
    </VSnackbar>
  </div>
</template>

<style scoped>
.v-btn-toggle {
  flex-wrap: wrap;
}

.v-btn-toggle .v-btn {
  min-width: auto;
}
</style>
