<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'surveys',
  },
})

interface AcademicTerm {
  id: number
  schoolYear: string
  semester: string
}

interface DeanQuestion {
  id?: number
  question: string
  sort?: number
}

interface DeanQuestionGroup {
  id?: number
  number: number
  title: string
  response_style: string
  questions?: DeanQuestion[]
}

interface DeanSurveyForm {
  id?: number
  title: string
  description: string
  instruction: string
  survey_type: 'faculty_evaluation' | 'program_assessment'
  survey_start: string
  survey_end: string
  is_active: 'Active' | 'Draft' | 'Archived'
  academic_term_id: number | null
  question_groups: DeanQuestionGroup[]
}

interface DeanResponse {
  id: number
  survey_id: number
  dean_id: { id: number; first_name: string; last_name: string } | number
  evaluated_teacher_id?: { id: number; first_name: string; last_name: string } | number | null
  department_id?: { id: number; name: { programCode: string } } | number | null
  submitted_at: string
  answers?: any[]
}

interface QuestionStats {
  questionId: number
  questionText: string
  responseStyle: string
  groupTitle: string
  totalResponses: number
  average?: number
  distribution?: Record<string, number>
}

interface DeanItem {
  id: number
  first_name: string
  last_name: string
  position: string
  is_active: string
  departmentName?: string
}

interface DepartmentItem {
  id: number
  name: { id: number; programName: string; programCode: string } | number | null
  teacher_id?: { id: number; Teachers_id?: number }[]
}

const route = useRoute()
const router = useRouter()

const surveyId = computed(() => Number((route.params as { id: string }).id))

// State
const activeTab = ref<'edit' | 'assignment' | 'responses'>('edit')
const isLoading = ref(true)
const isSaving = ref(false)
const isLoadingResponses = ref(false)
const isLoadingDeans = ref(false)
const academicTerms = ref<AcademicTerm[]>([])
const responses = ref<DeanResponse[]>([])
const questionStats = ref<QuestionStats[]>([])

// Dean assignment state
const availableDeans = ref<DeanItem[]>([])
const assignedDeanIds = ref<number[]>([])
const deanSearch = ref('')
const assignmentMode = ref<'all' | 'specific'>('all')

const form = ref<DeanSurveyForm>({
  title: '',
  description: '',
  instruction: '',
  survey_type: 'faculty_evaluation',
  survey_start: '',
  survey_end: '',
  is_active: 'Draft',
  academic_term_id: null,
  question_groups: [],
})

// Snackbar state
const snackbar = ref({
  show: false,
  message: '',
  color: 'success',
})

// Options
const statusOptions = [
  { title: 'Draft', value: 'Draft' },
  { title: 'Active', value: 'Active' },
  { title: 'Archived', value: 'Archived' },
]

const surveyTypeOptions = [
  { title: 'Faculty Evaluation', value: 'faculty_evaluation' },
  { title: 'Program Assessment', value: 'program_assessment' },
]

const responseStyleOptions = ref<{ title: string; value: string }[]>([])

// Fetch response style options from Directus
const fetchResponseStyleOptions = async () => {
  try {
    const res = await $api('/fields/DeanQuestionGroup/response_style')
    const choices = res.data?.meta?.options?.choices || []
    responseStyleOptions.value = choices.map((choice: { text: string; value: string }) => ({
      title: choice.text,
      value: choice.value,
    }))
  }
  catch (error) {
    console.error('Failed to fetch response style options:', error)
    // Fallback to default options
    responseStyleOptions.value = [
      { title: 'Yes or No', value: 'Yes or No' },
      { title: 'Likert-Scale Questions', value: 'Likert-Scale Questions' },
      { title: 'Multiple-Choice Questions', value: 'Multiple-Choice Questions' },
      { title: 'Rating-Scale Questions', value: 'Rating-Scale Questions' },
      { title: 'Open-Ended Question', value: 'Open-Ended Quesrion' },
    ]
  }
}

// Format date for input field (YYYY-MM-DD)
const formatDateForInput = (dateStr: string | null): string => {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return ''
    return date.toISOString().split('T')[0]
  }
  catch {
    return ''
  }
}

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

// Fetch academic terms
const fetchAcademicTerms = async () => {
  try {
    const res = await $api('/items/academicTerms', {
      params: { sort: '-schoolYear' },
    })
    academicTerms.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch academic terms:', error)
  }
}

// Fetch survey details
const fetchSurveyDetails = async () => {
  isLoading.value = true
  try {
    const res = await $api(`/items/DeanEvaluationSurvey/${surveyId.value}`, {
      params: {
        fields: ['*', 'academic_term_id.*', 'question_groups.*', 'question_groups.questions.*'],
      },
    })

    const data = res.data

    // Extract academic term ID
    const acadTermId = typeof data.academic_term_id === 'object' && data.academic_term_id !== null
      ? data.academic_term_id.id
      : data.academic_term_id

    // Map question groups
    const questionGroups: DeanQuestionGroup[] = (data.question_groups || []).map((group: any, index: number) => ({
      id: group.id,
      number: group.number || index + 1,
      title: group.title || '',
      response_style: group.response_style || 'Likert-Scale Questions',
      questions: (group.questions || []).map((q: any) => ({
        id: q.id,
        question: q.question || '',
        sort: q.sort,
      })),
    }))

    form.value = {
      id: data.id,
      title: data.title || '',
      description: data.description || '',
      instruction: data.instruction || '',
      survey_type: data.survey_type || 'faculty_evaluation',
      survey_start: formatDateForInput(data.survey_start),
      survey_end: formatDateForInput(data.survey_end),
      is_active: data.is_active || 'Draft',
      academic_term_id: acadTermId,
      question_groups: questionGroups,
    }
  }
  catch (error) {
    console.error('Failed to fetch survey details:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Fetch survey responses
const fetchResponses = async () => {
  isLoadingResponses.value = true
  try {
    const res = await $api('/items/DeanSurveyResponse', {
      params: {
        filter: { survey_id: { _eq: surveyId.value } },
        fields: ['*', 'dean_id.*', 'evaluated_teacher_id.*', 'department_id.*', 'department_id.name.*', 'answers.*', 'answers.question_id.*'],
        sort: ['-submitted_at'],
      },
    })
    responses.value = res.data || []
    calculateStats()
  }
  catch (error) {
    console.error('Failed to fetch responses:', error)
    responses.value = []
  }
  finally {
    isLoadingResponses.value = false
  }
}

// Calculate statistics for each question
const calculateStats = () => {
  const stats: QuestionStats[] = []

  for (const group of form.value.question_groups) {
    for (const question of group.questions || []) {
      if (!question.id) continue

      const questionAnswers: string[] = []

      for (const response of responses.value) {
        if (!response.answers) continue
        for (const answer of response.answers) {
          const answerQuestionId = typeof answer.question_id === 'object'
            ? answer.question_id.id
            : answer.question_id
          if (answerQuestionId === question.id) {
            questionAnswers.push(answer.answer_value)
          }
        }
      }

      const stat: QuestionStats = {
        questionId: question.id,
        questionText: question.question,
        responseStyle: group.response_style,
        groupTitle: group.title,
        totalResponses: questionAnswers.length,
      }

      // Calculate based on response style
      if ((group.response_style === 'Likert-Scale Questions' || group.response_style === 'Rating-Scale Questions') && questionAnswers.length > 0) {
        const numericAnswers = questionAnswers.map(a => parseFloat(a)).filter(n => !isNaN(n))
        if (numericAnswers.length > 0) {
          stat.average = numericAnswers.reduce((a, b) => a + b, 0) / numericAnswers.length
          stat.distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
          for (const val of numericAnswers) {
            const key = Math.round(val).toString()
            if (stat.distribution[key] !== undefined) {
              stat.distribution[key]++
            }
          }
        }
      }

      stats.push(stat)
    }
  }

  questionStats.value = stats
}

// Fetch available deans (teachers with Dean position) and their departments
const fetchDeans = async () => {
  isLoadingDeans.value = true
  try {
    // Fetch deans (teachers with Dean position)
    const deansRes = await $api('/items/Teachers', {
      params: {
        filter: {
          position: { _eq: 'Dean' },
          is_active: { _eq: 'Active' },
        },
        fields: ['*'],
        sort: ['last_name', 'first_name'],
        limit: -1,
      },
    })

    // Fetch departments to get dean-department mappings
    const deptsRes = await $api('/items/Department', {
      params: {
        fields: ['*', 'name.*', 'teacher_id.*'],
        limit: -1,
      },
    })

    const deans: DeanItem[] = deansRes.data || []
    const departments: DepartmentItem[] = deptsRes.data || []

    // Map department names to deans
    for (const dean of deans) {
      for (const dept of departments) {
        const teacherIds = dept.teacher_id || []
        const isDeanInDept = teacherIds.some((t: any) => {
          // Handle various structures: direct ID, object with id, or junction table with Teachers_id
          if (typeof t === 'number') return t === dean.id
          if (typeof t === 'object' && t !== null) {
            return t.Teachers_id === dean.id || t.id === dean.id
          }
          return false
        })
        if (isDeanInDept && typeof dept.name === 'object' && dept.name) {
          dean.departmentName = dept.name.programCode || dept.name.programName
          break
        }
      }
    }

    availableDeans.value = deans
  }
  catch (error) {
    console.error('Failed to fetch deans:', error)
    availableDeans.value = []
  }
  finally {
    isLoadingDeans.value = false
  }
}

// Fetch assigned deans for this survey
const fetchAssignedDeans = async () => {
  try {
    // Get assignment mode from survey
    const surveyRes = await $api(`/items/DeanEvaluationSurvey/${surveyId.value}`, {
      params: {
        fields: ['assignment_mode'],
      },
    })
    assignmentMode.value = surveyRes.data?.assignment_mode || 'all'

    // Get assigned deans from junction table
    const junctionRes = await $api('/items/DeanEvaluationSurvey_Teachers', {
      params: {
        filter: { DeanEvaluationSurvey_id: { _eq: surveyId.value } },
        fields: ['id', 'Teachers_id'],
      },
    })
    const junctions = junctionRes.data || []
    assignedDeanIds.value = junctions.map((j: any) => {
      if (typeof j.Teachers_id === 'object' && j.Teachers_id !== null) {
        return j.Teachers_id.id
      }
      return j.Teachers_id
    }).filter((id: any) => id != null && typeof id === 'number')
  }
  catch (error) {
    console.error('Failed to fetch assigned deans:', error)
    assignedDeanIds.value = []
    assignmentMode.value = 'all'
  }
}

// Filtered deans based on search
const filteredDeans = computed(() => {
  if (!deanSearch.value) return availableDeans.value
  const search = deanSearch.value.toLowerCase()
  return availableDeans.value.filter(d => {
    const fullName = `${d.first_name} ${d.last_name}`.toLowerCase()
    const deptName = d.departmentName?.toLowerCase() || ''
    return fullName.includes(search) || deptName.includes(search)
  })
})

// Toggle dean assignment
const toggleDeanAssignment = (deanId: number) => {
  const index = assignedDeanIds.value.indexOf(deanId)
  if (index === -1) {
    assignedDeanIds.value.push(deanId)
  }
  else {
    assignedDeanIds.value.splice(index, 1)
  }
}

// Check if dean is assigned
const isDeanAssigned = (deanId: number): boolean => {
  return assignedDeanIds.value.includes(deanId)
}

// Get dean display name
const getDeanDisplayName = (d: DeanItem): string => {
  return `${d.first_name} ${d.last_name}`
}

// Get dean department
const getDeanDepartment = (d: DeanItem): string => {
  return d.departmentName || 'No department'
}

// Select all deans
const selectAllDeans = () => {
  assignedDeanIds.value = availableDeans.value.map(d => d.id)
}

// Deselect all deans
const deselectAllDeans = () => {
  assignedDeanIds.value = []
}

// Get color for average score
const getAverageColor = (avg: number): string => {
  if (avg >= 4) return 'success'
  if (avg >= 3) return 'warning'
  return 'error'
}

// Get dean name
const getDeanName = (response: DeanResponse): string => {
  if (typeof response.dean_id === 'object' && response.dean_id !== null) {
    return `${response.dean_id.last_name}, ${response.dean_id.first_name}`
  }
  return `Dean #${response.dean_id}`
}

// Get evaluated teacher name
const getEvaluatedTeacher = (response: DeanResponse): string => {
  if (!response.evaluated_teacher_id) return '-'
  if (typeof response.evaluated_teacher_id === 'object' && response.evaluated_teacher_id !== null) {
    return `${response.evaluated_teacher_id.last_name}, ${response.evaluated_teacher_id.first_name}`
  }
  return `Teacher #${response.evaluated_teacher_id}`
}

// Question Group Management
const addQuestionGroup = () => {
  form.value.question_groups.push({
    number: form.value.question_groups.length + 1,
    title: '',
    response_style: 'likert',
    questions: [{ question: '' }],
  })
}

const removeQuestionGroup = (index: number) => {
  form.value.question_groups.splice(index, 1)
  form.value.question_groups.forEach((group, i) => {
    group.number = i + 1
  })
}

// Question Management
const addQuestion = (groupIndex: number) => {
  form.value.question_groups[groupIndex].questions!.push({ question: '' })
}

const removeQuestion = (groupIndex: number, questionIndex: number) => {
  form.value.question_groups[groupIndex].questions!.splice(questionIndex, 1)
}

// Save survey
const saveSurvey = async () => {
  if (!form.value.title.trim()) {
    snackbar.value = { show: true, message: 'Please enter a survey title', color: 'error' }
    return
  }

  isSaving.value = true
  try {
    // Build the request body WITHOUT assigned_deans (we'll handle M2M separately)
    const requestBody: any = {
      title: form.value.title,
      description: form.value.description,
      instruction: form.value.instruction,
      survey_type: form.value.survey_type,
      survey_start: form.value.survey_start || null,
      survey_end: form.value.survey_end || null,
      is_active: form.value.is_active,
      academic_term_id: form.value.academic_term_id,
      question_groups: form.value.question_groups.length > 0 ? form.value.question_groups : undefined,
      assignment_mode: assignmentMode.value,
    }

    await $api(`/items/DeanEvaluationSurvey/${surveyId.value}`, {
      method: 'PATCH',
      body: requestBody,
    })

    // Handle M2M assigned_deans via junction table
    // First, get existing assignments
    const existingRes = await $api('/items/DeanEvaluationSurvey_Teachers', {
      params: {
        filter: { DeanEvaluationSurvey_id: { _eq: surveyId.value } },
        fields: ['id', 'Teachers_id'],
      },
    })
    const existingJunctions = existingRes.data || []
    const existingDeanIds = existingJunctions.map((j: any) =>
      typeof j.Teachers_id === 'object' ? j.Teachers_id?.id : j.Teachers_id,
    )

    // Get target dean IDs based on mode
    const targetDeanIds = assignmentMode.value === 'specific' ? assignedDeanIds.value : []

    // Determine which to add and which to delete
    const toAdd = targetDeanIds.filter((id: number) => !existingDeanIds.includes(id))
    const toDelete = existingJunctions
      .filter((j: any) => {
        const deanId = typeof j.Teachers_id === 'object' ? j.Teachers_id?.id : j.Teachers_id
        return !targetDeanIds.includes(deanId)
      })
      .map((j: any) => j.id)

    // Delete removed assignments
    for (const junctionId of toDelete) {
      await $api(`/items/DeanEvaluationSurvey_Teachers/${junctionId}`, {
        method: 'DELETE',
      })
    }

    // Add new assignments
    for (const deanId of toAdd) {
      await $api('/items/DeanEvaluationSurvey_Teachers', {
        method: 'POST',
        body: {
          DeanEvaluationSurvey_id: surveyId.value,
          Teachers_id: deanId,
        },
      })
    }

    snackbar.value = { show: true, message: 'Evaluation saved successfully!', color: 'success' }
    router.push('/surveys')
  }
  catch (error: any) {
    console.error('Failed to save survey:', error)
    const errorMsg = error?.data?.errors?.[0]?.message || error?.statusText || 'Failed to save evaluation'
    snackbar.value = { show: true, message: `Error: ${errorMsg}`, color: 'error' }
  }
  finally {
    isSaving.value = false
  }
}

// Go back to surveys list
const goBack = () => {
  router.push('/surveys')
}

// Go to detailed responses page
const goToDetailedResponses = () => {
  router.push(`/surveys/dean/${surveyId.value}-responses`)
}

// Watch tab changes
watch(activeTab, (newTab) => {
  if (newTab === 'responses' && responses.value.length === 0) {
    fetchResponses()
  }
  if (newTab === 'assignment' && availableDeans.value.length === 0) {
    fetchDeans()
    fetchAssignedDeans()
  }
})

onMounted(() => {
  fetchResponseStyleOptions()
  fetchAcademicTerms()
  fetchSurveyDetails()
  fetchAssignedDeans()
})
</script>

<template>
  <div>
    <!-- Loading State -->
    <VCard v-if="isLoading">
      <VCardText class="d-flex justify-center align-center pa-12">
        <VProgressCircular indeterminate color="primary" />
        <span class="ms-4">Loading evaluation...</span>
      </VCardText>
    </VCard>

    <!-- Main Content -->
    <VCard v-else>
      <VCardTitle class="pa-6">
        <div class="d-flex align-center">
          <VBtn icon variant="text" class="me-2" @click="goBack">
            <VIcon icon="ri-arrow-left-line" />
          </VBtn>
          <VIcon icon="ri-user-settings-line" size="28" class="me-3" />
          <div>
            <span class="text-h5">{{ form.title }}</span>
            <div class="d-flex align-center gap-2 mt-1">
              <VChip
                :color="form.is_active === 'Active' ? 'success' : form.is_active === 'Draft' ? 'warning' : 'secondary'"
                size="small"
                variant="tonal"
              >
                {{ form.is_active }}
              </VChip>
              <VChip
                :color="form.survey_type === 'faculty_evaluation' ? 'info' : 'warning'"
                size="small"
                variant="tonal"
              >
                {{ form.survey_type === 'faculty_evaluation' ? 'Faculty Evaluation' : 'Program Assessment' }}
              </VChip>
            </div>
          </div>
        </div>
      </VCardTitle>

      <VDivider />

      <!-- Tabs -->
      <VTabs v-model="activeTab" class="px-4">
        <VTab value="edit">
          <VIcon icon="ri-edit-line" class="me-2" />
          Edit Evaluation
        </VTab>
        <VTab value="assignment">
          <VIcon icon="ri-user-settings-line" class="me-2" />
          Assignment
          <VChip v-if="assignmentMode === 'specific' && assignedDeanIds.length > 0" size="x-small" color="success" class="ms-2">
            {{ assignedDeanIds.length }}
          </VChip>
          <VChip v-else-if="assignmentMode === 'all'" size="x-small" color="info" class="ms-2">
            All
          </VChip>
        </VTab>
        <VTab value="responses">
          <VIcon icon="ri-bar-chart-line" class="me-2" />
          Responses
          <VChip v-if="responses.length > 0" size="x-small" color="primary" class="ms-2">
            {{ responses.length }}
          </VChip>
        </VTab>
      </VTabs>

      <VDivider />

      <!-- Edit Tab -->
      <template v-if="activeTab === 'edit'">
        <VCardText class="pa-6">
          <VForm @submit.prevent="saveSurvey">
            <VRow>
              <!-- Basic Information -->
              <VCol cols="12">
                <h6 class="text-h6 mb-4">Basic Information</h6>
              </VCol>

              <VCol cols="12" md="6">
                <VTextField
                  v-model="form.title"
                  label="Evaluation Title"
                  placeholder="Enter evaluation title"
                  variant="outlined"
                  :rules="[v => !!v || 'Title is required']"
                />
              </VCol>

              <VCol cols="12" md="3">
                <VSelect
                  v-model="form.survey_type"
                  :items="surveyTypeOptions"
                  item-title="title"
                  item-value="value"
                  label="Evaluation Type"
                  variant="outlined"
                />
              </VCol>

              <VCol cols="12" md="3">
                <VSelect
                  v-model="form.is_active"
                  :items="statusOptions"
                  item-title="title"
                  item-value="value"
                  label="Status"
                  variant="outlined"
                />
              </VCol>

              <VCol cols="12">
                <VTextarea
                  v-model="form.description"
                  label="Description"
                  placeholder="Enter evaluation description"
                  variant="outlined"
                  rows="3"
                />
              </VCol>

              <VCol cols="12">
                <VTextarea
                  v-model="form.instruction"
                  label="Instructions"
                  placeholder="Enter instructions for respondents"
                  variant="outlined"
                  rows="3"
                />
              </VCol>

              <!-- Schedule -->
              <VCol cols="12" class="mt-4">
                <h6 class="text-h6 mb-4">Schedule</h6>
              </VCol>

              <VCol cols="12" md="4">
                <VSelect
                  v-model="form.academic_term_id"
                  :items="academicTerms"
                  :item-title="(item) => `${item.semester} - ${item.schoolYear}`"
                  item-value="id"
                  label="Academic Term"
                  variant="outlined"
                  clearable
                />
              </VCol>

              <VCol cols="12" md="4">
                <VTextField
                  v-model="form.survey_start"
                  label="Start Date"
                  type="date"
                  variant="outlined"
                />
              </VCol>

              <VCol cols="12" md="4">
                <VTextField
                  v-model="form.survey_end"
                  label="End Date"
                  type="date"
                  variant="outlined"
                />
              </VCol>

              <!-- Question Groups -->
              <VCol cols="12" class="mt-4">
                <div class="d-flex align-center justify-space-between mb-4">
                  <h6 class="text-h6">Question Groups</h6>
                  <VBtn
                    color="primary"
                    variant="outlined"
                    size="small"
                    prepend-icon="ri-add-line"
                    @click="addQuestionGroup"
                  >
                    Add Group
                  </VBtn>
                </div>
              </VCol>

              <VCol v-if="form.question_groups.length === 0" cols="12">
                <VAlert type="info" variant="tonal">
                  No question groups added yet. Click "Add Group" to create your first question group.
                </VAlert>
              </VCol>

              <VCol v-for="(group, groupIndex) in form.question_groups" :key="groupIndex" cols="12">
                <VCard variant="outlined" class="mb-4">
                  <VCardTitle class="pa-4 bg-grey-lighten-4">
                    <div class="d-flex align-center justify-space-between">
                      <span class="text-subtitle-1 font-weight-medium">
                        Group {{ group.number }}
                      </span>
                      <VBtn
                        icon
                        variant="text"
                        color="error"
                        size="small"
                        @click="removeQuestionGroup(groupIndex)"
                      >
                        <VIcon icon="ri-delete-bin-line" />
                      </VBtn>
                    </div>
                  </VCardTitle>

                  <VDivider />

                  <VCardText class="pa-4">
                    <VRow>
                      <VCol cols="12" md="6">
                        <VTextField
                          v-model="group.title"
                          label="Group Title (Optional)"
                          placeholder="e.g., Teaching Quality"
                          variant="outlined"
                          density="compact"
                        />
                      </VCol>

                      <VCol cols="12" md="6">
                        <VSelect
                          v-model="group.response_style"
                          :items="responseStyleOptions"
                          item-title="title"
                          item-value="value"
                          label="Response Style"
                          variant="outlined"
                          density="compact"
                        />
                      </VCol>

                      <VCol cols="12">
                        <div class="d-flex align-center justify-space-between mb-3">
                          <span class="text-subtitle-2">Questions</span>
                          <VBtn
                            color="secondary"
                            variant="tonal"
                            size="x-small"
                            prepend-icon="ri-add-line"
                            @click="addQuestion(groupIndex)"
                          >
                            Add Question
                          </VBtn>
                        </div>

                        <div
                          v-for="(question, questionIndex) in group.questions"
                          :key="questionIndex"
                          class="d-flex align-center gap-2 mb-2"
                        >
                          <span class="text-body-2 text-medium-emphasis" style="min-width: 24px;">
                            {{ questionIndex + 1 }}.
                          </span>
                          <VTextField
                            v-model="question.question"
                            :placeholder="`Enter question ${questionIndex + 1}`"
                            variant="outlined"
                            density="compact"
                            hide-details
                            class="flex-grow-1"
                          />
                          <VBtn
                            icon
                            variant="text"
                            color="error"
                            size="x-small"
                            :disabled="group.questions!.length === 1"
                            @click="removeQuestion(groupIndex, questionIndex)"
                          >
                            <VIcon icon="ri-close-line" size="18" />
                          </VBtn>
                        </div>
                      </VCol>
                    </VRow>
                  </VCardText>
                </VCard>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-6">
          <VSpacer />
          <VBtn variant="outlined" @click="goBack">
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :loading="isSaving"
            @click="saveSurvey"
          >
            Save Changes
          </VBtn>
        </VCardActions>
      </template>

      <!-- Assignment Tab -->
      <template v-else-if="activeTab === 'assignment'">
        <VCardText class="pa-6">
          <!-- Loading -->
          <div v-if="isLoadingDeans" class="d-flex justify-center align-center pa-12">
            <VProgressCircular indeterminate color="primary" />
            <span class="ms-4">Loading deans...</span>
          </div>

          <template v-else>
            <!-- Assignment Mode Selection -->
            <VCard variant="outlined" class="mb-6">
              <VCardTitle class="pa-4">Assignment Mode</VCardTitle>
              <VDivider />
              <VCardText class="pa-4">
                <VRadioGroup v-model="assignmentMode" inline>
                  <VRadio value="all" label="All Deans" />
                  <VRadio value="specific" label="Specific Deans" />
                </VRadioGroup>
                <p class="text-body-2 text-medium-emphasis mt-2">
                  <template v-if="assignmentMode === 'all'">
                    This evaluation will be available to all active deans in the system.
                  </template>
                  <template v-else>
                    Select specific deans who should complete this evaluation.
                  </template>
                </p>
              </VCardText>
            </VCard>

            <!-- Specific Deans Selection (only shown when mode is 'specific') -->
            <template v-if="assignmentMode === 'specific'">
              <!-- Summary Cards -->
              <VRow class="mb-6">
                <VCol cols="12" md="6">
                  <VCard variant="tonal" color="primary">
                    <VCardText class="d-flex align-center justify-space-between">
                      <div>
                        <p class="text-overline mb-1">Available Deans</p>
                        <p class="text-h4 font-weight-bold">{{ availableDeans.length }}</p>
                      </div>
                      <VAvatar color="primary" size="48">
                        <VIcon icon="ri-user-star-line" size="24" />
                      </VAvatar>
                    </VCardText>
                  </VCard>
                </VCol>

                <VCol cols="12" md="6">
                  <VCard variant="tonal" color="success">
                    <VCardText class="d-flex align-center justify-space-between">
                      <div>
                        <p class="text-overline mb-1">Assigned Deans</p>
                        <p class="text-h4 font-weight-bold">{{ assignedDeanIds.length }}</p>
                      </div>
                      <VAvatar color="success" size="48">
                        <VIcon icon="ri-checkbox-circle-line" size="24" />
                      </VAvatar>
                    </VCardText>
                  </VCard>
                </VCol>
              </VRow>

              <!-- Search and Actions -->
              <div class="d-flex align-center gap-4 mb-4">
                <VTextField
                  v-model="deanSearch"
                  prepend-inner-icon="ri-search-line"
                  placeholder="Search deans..."
                  density="compact"
                  variant="outlined"
                  hide-details
                  style="max-width: 300px;"
                />
                <VSpacer />
                <VBtn
                  variant="outlined"
                  color="success"
                  size="small"
                  prepend-icon="ri-checkbox-multiple-line"
                  @click="selectAllDeans"
                >
                  Select All
                </VBtn>
                <VBtn
                  variant="outlined"
                  color="secondary"
                  size="small"
                  prepend-icon="ri-checkbox-blank-line"
                  @click="deselectAllDeans"
                >
                  Deselect All
                </VBtn>
              </div>

              <!-- No Deans -->
              <div v-if="availableDeans.length === 0" class="text-center pa-12">
                <VIcon icon="ri-user-star-line" size="64" color="medium-emphasis" class="mb-4" />
                <p class="text-h6 text-medium-emphasis mb-2">No Deans Available</p>
                <p class="text-body-2 text-medium-emphasis">
                  Add teachers with the "Dean" position to assign them to evaluations.
                </p>
              </div>

              <!-- Deans List -->
              <VList v-else lines="two" class="border rounded">
                <template v-for="(dean, index) in filteredDeans" :key="dean.id">
                  <VListItem
                    :class="{ 'bg-success-lighten-5': isDeanAssigned(dean.id) }"
                    @click="toggleDeanAssignment(dean.id)"
                  >
                    <template #prepend>
                      <VCheckbox
                        :model-value="isDeanAssigned(dean.id)"
                        hide-details
                        density="compact"
                        @click.stop="toggleDeanAssignment(dean.id)"
                      />
                    </template>

                    <VListItemTitle class="font-weight-medium">
                      {{ getDeanDisplayName(dean) }}
                    </VListItemTitle>

                    <VListItemSubtitle>
                      {{ getDeanDepartment(dean) }}
                    </VListItemSubtitle>

                    <template #append>
                      <VChip size="small" variant="tonal" color="info">
                        <VIcon icon="ri-building-line" size="14" class="me-1" />
                        {{ dean.departmentName || 'No Dept' }}
                      </VChip>
                    </template>
                  </VListItem>

                  <VDivider v-if="index < filteredDeans.length - 1" />
                </template>
              </VList>

              <!-- No search results -->
              <div v-if="availableDeans.length > 0 && filteredDeans.length === 0" class="text-center pa-8">
                <VIcon icon="ri-search-line" size="48" color="medium-emphasis" class="mb-4" />
                <p class="text-body-1 text-medium-emphasis">No deans match your search</p>
              </div>
            </template>

            <!-- All Deans Mode Info -->
            <template v-else>
              <VAlert type="info" variant="tonal">
                <template #title>All Deans Mode</template>
                <p class="mb-2">
                  When set to "All Deans", this evaluation will automatically be available to all active deans ({{ availableDeans.length }} currently).
                </p>
                <p class="text-body-2">
                  Deans will see this evaluation in their pending list and can complete it during the active period.
                </p>
              </VAlert>
            </template>
          </template>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-6">
          <VSpacer />
          <VBtn variant="outlined" @click="goBack">
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :loading="isSaving"
            @click="saveSurvey"
          >
            Save Changes
          </VBtn>
        </VCardActions>
      </template>

      <!-- Responses Tab -->
      <template v-else-if="activeTab === 'responses'">
        <VCardText class="pa-6">
          <!-- Loading -->
          <div v-if="isLoadingResponses" class="d-flex justify-center align-center pa-12">
            <VProgressCircular indeterminate color="primary" />
            <span class="ms-4">Loading responses...</span>
          </div>

          <!-- No Responses -->
          <div v-else-if="responses.length === 0" class="text-center pa-12">
            <VIcon icon="ri-bar-chart-line" size="64" color="medium-emphasis" class="mb-4" />
            <p class="text-h6 text-medium-emphasis mb-2">No Responses Yet</p>
            <p class="text-body-2 text-medium-emphasis">
              When deans submit their evaluations, you'll see the results here.
            </p>
          </div>

          <!-- Responses Summary -->
          <template v-else>
            <!-- Overview Cards -->
            <VRow class="mb-6">
              <VCol cols="12" md="4">
                <VCard variant="tonal" color="primary">
                  <VCardText class="d-flex align-center justify-space-between">
                    <div>
                      <p class="text-overline mb-1">Total Responses</p>
                      <p class="text-h4 font-weight-bold">{{ responses.length }}</p>
                    </div>
                    <VAvatar color="primary" size="48">
                      <VIcon icon="ri-user-line" size="24" />
                    </VAvatar>
                  </VCardText>
                </VCard>
              </VCol>

              <VCol cols="12" md="4">
                <VCard variant="tonal" color="info">
                  <VCardText class="d-flex align-center justify-space-between">
                    <div>
                      <p class="text-overline mb-1">Questions</p>
                      <p class="text-h4 font-weight-bold">{{ questionStats.length }}</p>
                    </div>
                    <VAvatar color="info" size="48">
                      <VIcon icon="ri-question-line" size="24" />
                    </VAvatar>
                  </VCardText>
                </VCard>
              </VCol>

              <VCol cols="12" md="4">
                <VCard variant="tonal" color="success">
                  <VCardText class="d-flex align-center justify-space-between">
                    <div>
                      <p class="text-overline mb-1">Latest Response</p>
                      <p class="text-body-1 font-weight-medium">
                        {{ formatDateDisplay(responses[0]?.submitted_at) }}
                      </p>
                    </div>
                    <VAvatar color="success" size="48">
                      <VIcon icon="ri-time-line" size="24" />
                    </VAvatar>
                  </VCardText>
                </VCard>
              </VCol>
            </VRow>

            <!-- Question Statistics -->
            <div class="d-flex align-center justify-space-between mb-4">
              <h6 class="text-h6">Question Statistics</h6>
              <VBtn
                color="primary"
                variant="outlined"
                prepend-icon="ri-eye-line"
                @click="goToDetailedResponses"
              >
                View All Responses
              </VBtn>
            </div>

            <VCard v-for="stat in questionStats" :key="stat.questionId" variant="outlined" class="mb-4">
              <VCardText class="pa-4">
                <div class="d-flex align-center justify-space-between mb-3">
                  <div class="flex-grow-1">
                    <p class="text-body-1 font-weight-medium mb-1">{{ stat.questionText }}</p>
                    <div class="d-flex align-center gap-2">
                      <VChip v-if="stat.groupTitle" size="x-small" variant="tonal" color="secondary">
                        {{ stat.groupTitle }}
                      </VChip>
                      <VChip size="x-small" variant="tonal">
                        {{ responseStyleOptions.find(o => o.value === stat.responseStyle)?.title || stat.responseStyle }}
                      </VChip>
                    </div>
                  </div>
                  <VChip color="secondary" variant="tonal" size="small">
                    {{ stat.totalResponses }} responses
                  </VChip>
                </div>

                <!-- Likert/Rating Scale Stats -->
                <template v-if="(stat.responseStyle === 'Likert-Scale Questions' || stat.responseStyle === 'Rating-Scale Questions') && stat.average !== undefined">
                  <div class="d-flex align-center gap-4 mb-3">
                    <div>
                      <span class="text-overline">Average</span>
                      <div class="d-flex align-center gap-2">
                        <span class="text-h5 font-weight-bold">{{ stat.average.toFixed(2) }}</span>
                        <VChip :color="getAverageColor(stat.average)" size="small" variant="tonal">
                          / 5
                        </VChip>
                      </div>
                    </div>
                    <VProgressLinear
                      :model-value="(stat.average / 5) * 100"
                      :color="getAverageColor(stat.average)"
                      height="12"
                      rounded
                      class="flex-grow-1"
                    />
                  </div>

                  <div v-if="stat.distribution" class="d-flex gap-2 flex-wrap">
                    <VChip
                      v-for="(count, rating) in stat.distribution"
                      :key="rating"
                      size="small"
                      variant="tonal"
                      :color="Number(rating) >= 4 ? 'success' : Number(rating) >= 3 ? 'warning' : 'error'"
                    >
                      {{ rating }}: {{ count }}
                    </VChip>
                  </div>
                </template>

                <!-- Other types -->
                <template v-else>
                  <p class="text-body-2 text-medium-emphasis">
                    View detailed responses to see individual answers.
                  </p>
                </template>
              </VCardText>
            </VCard>

            <!-- Recent Responses -->
            <h6 class="text-h6 mb-4 mt-6">Recent Responses</h6>
            <VTable density="comfortable">
              <thead>
                <tr>
                  <th>Dean</th>
                  <th v-if="form.survey_type === 'faculty_evaluation'">Evaluated Teacher</th>
                  <th>Submitted At</th>
                  <th class="text-center">Answers</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="response in responses.slice(0, 5)" :key="response.id">
                  <td>{{ getDeanName(response) }}</td>
                  <td v-if="form.survey_type === 'faculty_evaluation'">{{ getEvaluatedTeacher(response) }}</td>
                  <td>{{ formatDateDisplay(response.submitted_at) }}</td>
                  <td class="text-center">
                    <VChip size="small" color="info" variant="tonal">
                      {{ response.answers?.length || 0 }}
                    </VChip>
                  </td>
                </tr>
              </tbody>
            </VTable>

            <div v-if="responses.length > 5" class="text-center mt-4">
              <VBtn variant="text" color="primary" @click="goToDetailedResponses">
                View all {{ responses.length }} responses
              </VBtn>
            </div>
          </template>
        </VCardText>
      </template>
    </VCard>

    <!-- Snackbar for notifications -->
    <VSnackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="4000"
      location="top end"
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
