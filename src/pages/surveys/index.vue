<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'surveys',
  },
})

const router = useRouter()

// ==================== INTERFACES ====================

interface AcademicTerm {
  id: number
  schoolYear: string
  semester: string
}

// Student Survey Interfaces
interface Question {
  id?: number
  question: string
  survey_group_id?: number
}

interface QuestionGroup {
  id?: number
  number: number
  response_style: string
  question_id?: Question[]
}

interface ClassStudent {
  students_id: number | { id: number }
}

interface SurveyClass {
  classes_id: number | {
    id: number
    student_id?: ClassStudent[]
  }
}

interface StudentSurvey {
  id?: number
  title: string
  description: string
  instruction: string
  survey_start: string
  survey_end: string
  percentage: number | null
  is_active: 'Active' | 'Draft' | 'Archived'
  academic_term_id: AcademicTerm | number | null
  answer_id?: QuestionGroup[]
  classes?: SurveyClass[]
  _responseCount?: number
  _totalStudents?: number
}

interface StudentSurveyForm {
  id?: number
  title: string
  description: string
  instruction: string
  survey_start: string
  survey_end: string
  is_active: 'Active' | 'Draft' | 'Archived'
  academic_term_id: number | null
}

// Dean Survey Interfaces
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

interface DeanSurvey {
  id?: number
  title: string
  description: string
  instruction: string
  survey_type: 'faculty_evaluation' | 'program_assessment'
  survey_start: string
  survey_end: string
  is_active: 'Active' | 'Draft' | 'Archived'
  academic_term_id: AcademicTerm | number | null
  question_groups?: DeanQuestionGroup[]
  _responseCount?: number
  _totalExpected?: number
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
}

// ==================== STATE ====================

// Common State
const academicTerms = ref<AcademicTerm[]>([])
const isLoading = ref(false)
const activeTab = ref<'Student' | 'Dean'>('Student')

// Student Survey State
const studentSurveys = ref<StudentSurvey[]>([])
const isStudentDeleteDialogOpen = ref(false)
const isStudentCreateDialogOpen = ref(false)
const isStudentSaving = ref(false)
const selectedStudentSurvey = ref<StudentSurvey | null>(null)
const studentSearch = ref('')
const studentStatusFilter = ref<string | null>(null)

const studentForm = ref<StudentSurveyForm>({
  title: '',
  description: '',
  instruction: '',
  survey_start: '',
  survey_end: '',
  is_active: 'Draft',
  academic_term_id: null,
})

// Dean Survey State
const deanSurveys = ref<DeanSurvey[]>([])
const isDeanDeleteDialogOpen = ref(false)
const isDeanCreateDialogOpen = ref(false)
const isDeanSaving = ref(false)
const selectedDeanSurvey = ref<DeanSurvey | null>(null)
const deanSearch = ref('')
const deanStatusFilter = ref<string | null>(null)
const deanTypeFilter = ref<string | null>(null)

const deanForm = ref<DeanSurveyForm>({
  title: '',
  description: '',
  instruction: '',
  survey_type: 'faculty_evaluation',
  survey_start: '',
  survey_end: '',
  is_active: 'Draft',
  academic_term_id: null,
})

// ==================== OPTIONS ====================

const statusOptions = [
  { title: 'Draft', value: 'Draft' },
  { title: 'Active', value: 'Active' },
  { title: 'Archived', value: 'Archived' },
]

const surveyTypeOptions = [
  { title: 'Faculty Evaluation', value: 'faculty_evaluation' },
  { title: 'Program Assessment', value: 'program_assessment' },
]

// ==================== COMPUTED ====================

// Filtered student surveys
const filteredStudentSurveys = computed(() => {
  let result = studentSurveys.value

  if (studentStatusFilter.value)
    result = result.filter((s: StudentSurvey) => s.is_active === studentStatusFilter.value)

  if (studentSearch.value) {
    const searchLower = studentSearch.value.toLowerCase()
    result = result.filter((s: StudentSurvey) =>
      s.title.toLowerCase().includes(searchLower)
      || (s.description && s.description.toLowerCase().includes(searchLower)),
    )
  }

  return result
})

// Filtered dean surveys
const filteredDeanSurveys = computed(() => {
  let result = deanSurveys.value

  if (deanStatusFilter.value)
    result = result.filter((s: DeanSurvey) => s.is_active === deanStatusFilter.value)

  if (deanTypeFilter.value)
    result = result.filter((s: DeanSurvey) => s.survey_type === deanTypeFilter.value)

  if (deanSearch.value) {
    const searchLower = deanSearch.value.toLowerCase()
    result = result.filter((s: DeanSurvey) =>
      s.title.toLowerCase().includes(searchLower)
      || (s.description && s.description.toLowerCase().includes(searchLower)),
    )
  }

  return result
})

// ==================== TABLE HEADERS ====================

const studentHeaders = [
  { title: 'Title', key: 'title', sortable: true },
  { title: 'Academic Term', key: 'acadTerm', sortable: false },
  { title: 'Status', key: 'is_active', sortable: true },
  { title: 'Questions', key: 'questions', sortable: false, align: 'center' as const },
  { title: 'Progress', key: 'percentage', sortable: true, align: 'center' as const },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' as const },
]

const deanHeaders = [
  { title: 'Title', key: 'title', sortable: true },
  { title: 'Type', key: 'survey_type', sortable: true },
  { title: 'Academic Term', key: 'acadTerm', sortable: false },
  { title: 'Status', key: 'is_active', sortable: true },
  { title: 'Questions', key: 'questions', sortable: false, align: 'center' as const },
  { title: 'Progress', key: 'progress', sortable: false, align: 'center' as const },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' as const },
]

// ==================== HELPERS ====================

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Active': return 'success'
    case 'Draft': return 'warning'
    case 'Archived': return 'secondary'
    default: return 'default'
  }
}

const getSurveyTypeColor = (type: string) => {
  return type === 'faculty_evaluation' ? 'info' : 'warning'
}

const getSurveyTypeLabel = (type: string) => {
  return type === 'faculty_evaluation' ? 'Faculty' : 'Program'
}

const getAcademicTermDisplay = (survey: StudentSurvey | DeanSurvey): string => {
  if (!survey.academic_term_id) return '-'
  if (typeof survey.academic_term_id === 'object' && survey.academic_term_id !== null) {
    const term = survey.academic_term_id
    if (term.semester && term.schoolYear)
      return `${term.semester} - ${term.schoolYear}`
    return `Term #${term.id}`
  }
  const term = academicTerms.value.find((t: AcademicTerm) => t.id === survey.academic_term_id)
  if (term)
    return `${term.semester} - ${term.schoolYear}`
  return '-'
}

// Student survey helpers
const getStudentQuestionsCount = (survey: StudentSurvey): number => {
  if (!survey.answer_id || !Array.isArray(survey.answer_id)) return 0
  return survey.answer_id.reduce((total, group) => {
    if (group.question_id && Array.isArray(group.question_id))
      return total + group.question_id.length
    return total
  }, 0)
}

const getTotalStudents = (survey: StudentSurvey): number => {
  if (!survey.classes || !Array.isArray(survey.classes)) return 0

  let total = 0
  for (const classItem of survey.classes) {
    if (typeof classItem.classes_id === 'object' && classItem.classes_id !== null) {
      const classData = classItem.classes_id
      if (classData.student_id && Array.isArray(classData.student_id)) {
        total += classData.student_id.length
      }
    }
  }
  return total
}

const getStudentProgress = (survey: StudentSurvey): number => {
  const totalStudents = survey._totalStudents ?? getTotalStudents(survey)
  const responseCount = survey._responseCount ?? 0

  if (totalStudents === 0) return 0
  return Math.round((responseCount / totalStudents) * 100)
}

// Dean survey helpers
const getDeanQuestionsCount = (survey: DeanSurvey): number => {
  if (!survey.question_groups || !Array.isArray(survey.question_groups)) return 0
  return survey.question_groups.reduce((total, group) => {
    if (group.questions && Array.isArray(group.questions))
      return total + group.questions.length
    return total
  }, 0)
}

const getDeanProgress = (survey: DeanSurvey): number => {
  const total = survey._totalExpected ?? 0
  const responseCount = survey._responseCount ?? 0

  if (total === 0) return 0
  return Math.round((responseCount / total) * 100)
}

// ==================== FETCH FUNCTIONS ====================

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

// Fetch student surveys
const fetchStudentSurveys = async () => {
  isLoading.value = true
  try {
    const res = await $api('/items/StudentSatisfactionSurvey', {
      params: {
        fields: [
          '*',
          'academic_term_id.*',
          'answer_id.*',
          'answer_id.question_id.*',
          'classes.classes_id.id',
          'classes.classes_id.student_id.students_id',
        ],
        sort: ['-id'],
      },
    })

    const surveys: StudentSurvey[] = res.data || []

    for (const survey of surveys) {
      if (survey.id) {
        try {
          const responseRes = await $api('/items/StudentSurveyResponse', {
            params: {
              filter: { survey_id: { _eq: survey.id } },
              aggregate: { count: '*' },
            },
          })
          survey._responseCount = responseRes.data?.[0]?.count ?? 0
        }
        catch {
          survey._responseCount = 0
        }
        survey._totalStudents = getTotalStudents(survey)
      }
    }

    studentSurveys.value = surveys
  }
  catch (error) {
    console.error('Failed to fetch student surveys:', error)
    studentSurveys.value = []
  }
  finally {
    isLoading.value = false
  }
}

// Fetch dean surveys
const fetchDeanSurveys = async () => {
  isLoading.value = true
  try {
    const res = await $api('/items/DeanEvaluationSurvey', {
      params: {
        fields: [
          '*',
          'academic_term_id.*',
          'question_groups.*',
          'question_groups.questions.*',
        ],
        sort: ['-id'],
      },
    })

    const surveys: DeanSurvey[] = res.data || []

    // Fetch response counts and calculate expected totals
    for (const survey of surveys) {
      if (survey.id) {
        try {
          const responseRes = await $api('/items/DeanSurveyResponse', {
            params: {
              filter: { survey_id: { _eq: survey.id } },
              aggregate: { count: '*' },
            },
          })
          survey._responseCount = responseRes.data?.[0]?.count ?? 0
        }
        catch {
          survey._responseCount = 0
        }

        // Calculate expected responses based on survey type
        if (survey.survey_type === 'faculty_evaluation') {
          // For faculty evaluation: count deans * teachers in their departments
          try {
            const deansRes = await $api('/items/Teachers', {
              params: {
                filter: { position: { _eq: 'Dean' }, is_active: { _eq: 'Active' } },
                aggregate: { count: '*' },
              },
            })
            const teachersRes = await $api('/items/Teachers', {
              params: {
                filter: { position: { _eq: 'Professor' }, is_active: { _eq: 'Active' } },
                aggregate: { count: '*' },
              },
            })
            const deanCount = deansRes.data?.[0]?.count ?? 0
            const teacherCount = teachersRes.data?.[0]?.count ?? 0
            survey._totalExpected = deanCount * teacherCount
          }
          catch {
            survey._totalExpected = 0
          }
        }
        else {
          // For program assessment: count active deans
          try {
            const deansRes = await $api('/items/Teachers', {
              params: {
                filter: { position: { _eq: 'Dean' }, is_active: { _eq: 'Active' } },
                aggregate: { count: '*' },
              },
            })
            survey._totalExpected = deansRes.data?.[0]?.count ?? 0
          }
          catch {
            survey._totalExpected = 0
          }
        }
      }
    }

    deanSurveys.value = surveys
  }
  catch (error) {
    console.error('Failed to fetch dean surveys:', error)
    deanSurveys.value = []
  }
  finally {
    isLoading.value = false
  }
}

// ==================== STUDENT SURVEY ACTIONS ====================

const openStudentCreateDialog = () => {
  studentForm.value = {
    title: '',
    description: '',
    instruction: '',
    survey_start: '',
    survey_end: '',
    is_active: 'Draft',
    academic_term_id: null,
  }
  isStudentCreateDialogOpen.value = true
}

const saveStudentSurvey = async () => {
  if (!studentForm.value.title.trim()) return

  isStudentSaving.value = true
  try {
    await $api('/items/StudentSatisfactionSurvey', {
      method: 'POST',
      body: {
        title: studentForm.value.title,
        description: studentForm.value.description,
        instruction: studentForm.value.instruction,
        survey_start: studentForm.value.survey_start || null,
        survey_end: studentForm.value.survey_end || null,
        is_active: studentForm.value.is_active,
        academic_term_id: studentForm.value.academic_term_id,
      },
    })

    isStudentCreateDialogOpen.value = false
    await fetchStudentSurveys()
  }
  catch (error) {
    console.error('Failed to create survey:', error)
  }
  finally {
    isStudentSaving.value = false
  }
}

const goToStudentSurvey = (survey: StudentSurvey) => {
  if (survey.id) {
    router.push(`/surveys/${survey.id}`)
  }
}

const handleStudentRowClick = (_event: Event, row: { item: StudentSurvey }) => {
  goToStudentSurvey(row.item)
}

const openStudentDeleteDialog = (survey: StudentSurvey) => {
  selectedStudentSurvey.value = survey
  isStudentDeleteDialogOpen.value = true
}

const deleteStudentSurvey = async () => {
  if (!selectedStudentSurvey.value?.id) return

  try {
    await $api(`/items/StudentSatisfactionSurvey/${selectedStudentSurvey.value.id}`, {
      method: 'DELETE',
    })
    isStudentDeleteDialogOpen.value = false
    selectedStudentSurvey.value = null
    await fetchStudentSurveys()
  }
  catch (error) {
    console.error('Failed to delete survey:', error)
  }
}

// ==================== DEAN SURVEY ACTIONS ====================

const openDeanCreateDialog = () => {
  deanForm.value = {
    title: '',
    description: '',
    instruction: '',
    survey_type: 'faculty_evaluation',
    survey_start: '',
    survey_end: '',
    is_active: 'Draft',
    academic_term_id: null,
  }
  isDeanCreateDialogOpen.value = true
}

const saveDeanSurvey = async () => {
  if (!deanForm.value.title.trim()) return

  isDeanSaving.value = true
  try {
    await $api('/items/DeanEvaluationSurvey', {
      method: 'POST',
      body: {
        title: deanForm.value.title,
        description: deanForm.value.description,
        instruction: deanForm.value.instruction,
        survey_type: deanForm.value.survey_type,
        survey_start: deanForm.value.survey_start || null,
        survey_end: deanForm.value.survey_end || null,
        is_active: deanForm.value.is_active,
        academic_term_id: deanForm.value.academic_term_id,
      },
    })

    isDeanCreateDialogOpen.value = false
    await fetchDeanSurveys()
  }
  catch (error) {
    console.error('Failed to create dean survey:', error)
  }
  finally {
    isDeanSaving.value = false
  }
}

const goToDeanSurvey = (survey: DeanSurvey) => {
  if (survey.id) {
    router.push(`/surveys/dean/${survey.id}`)
  }
}

const handleDeanRowClick = (_event: Event, row: { item: DeanSurvey }) => {
  goToDeanSurvey(row.item)
}

const openDeanDeleteDialog = (survey: DeanSurvey) => {
  selectedDeanSurvey.value = survey
  isDeanDeleteDialogOpen.value = true
}

const deleteDeanSurvey = async () => {
  if (!selectedDeanSurvey.value?.id) return

  try {
    await $api(`/items/DeanEvaluationSurvey/${selectedDeanSurvey.value.id}`, {
      method: 'DELETE',
    })
    isDeanDeleteDialogOpen.value = false
    selectedDeanSurvey.value = null
    await fetchDeanSurveys()
  }
  catch (error) {
    console.error('Failed to delete dean survey:', error)
  }
}

// ==================== WATCHERS & LIFECYCLE ====================

watch(activeTab, (newTab: 'Student' | 'Dean') => {
  if (newTab === 'Student') fetchStudentSurveys()
  else fetchDeanSurveys()
})

onMounted(() => {
  fetchStudentSurveys()
  fetchAcademicTerms()
})
</script>

<template>
  <div>
    <VCard>
      <VCardTitle class="pa-6">
        <div class="d-flex align-center">
          <VIcon icon="ri-survey-line" size="28" class="me-3" />
          <span class="text-h5">Surveys</span>
        </div>
      </VCardTitle>

      <VDivider />

      <VTabs v-model="activeTab" class="px-4">
        <VTab value="Student">
          <VIcon icon="ri-emotion-happy-line" class="me-2" />
          Student Satisfaction Survey
        </VTab>
        <VTab value="Dean">
          <VIcon icon="ri-user-settings-line" class="me-2" />
          Dean Evaluation
        </VTab>
      </VTabs>

      <VDivider />

      <!-- ==================== STUDENT SURVEYS TAB ==================== -->
      <template v-if="activeTab === 'Student'">
        <div class="d-flex align-center pa-4 gap-4">
          <VTextField
            v-model="studentSearch"
            prepend-inner-icon="ri-search-line"
            placeholder="Search surveys..."
            density="compact"
            variant="outlined"
            hide-details
            style="max-width: 300px;"
          />
          <VSelect
            v-model="studentStatusFilter"
            :items="statusOptions"
            item-title="title"
            item-value="value"
            label="Status"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            style="max-width: 150px;"
          />
          <VSpacer />
          <VBtn color="primary" prepend-icon="ri-add-line" @click="openStudentCreateDialog">
            Create Survey
          </VBtn>
        </div>

        <VDivider />

        <VDataTable
          :headers="studentHeaders"
          :items="filteredStudentSurveys"
          :loading="isLoading"
          hover
          class="clickable-rows"
          @click:row="handleStudentRowClick"
        >
          <template #[`item.title`]="{ item }">
            <a
              class="font-weight-medium text-primary cursor-pointer text-decoration-none"
              @click="goToStudentSurvey(item)"
            >
              {{ item.title }}
            </a>
          </template>

          <template #[`item.acadTerm`]="{ item }">
            <VChip size="small" variant="tonal" color="secondary">
              {{ getAcademicTermDisplay(item) }}
            </VChip>
          </template>

          <template #[`item.is_active`]="{ item }">
            <VChip :color="getStatusColor(item.is_active)" size="small" variant="tonal">
              {{ item.is_active }}
            </VChip>
          </template>

          <template #[`item.questions`]="{ item }">
            <VChip size="small" variant="tonal" color="info">
              {{ getStudentQuestionsCount(item) }}
            </VChip>
          </template>

          <template #[`item.percentage`]="{ item }">
            <div class="d-flex align-center gap-2" style="min-width: 140px;">
              <VProgressLinear
                :model-value="getStudentProgress(item)"
                :color="getStudentProgress(item) >= 75 ? 'success' : getStudentProgress(item) >= 50 ? 'warning' : 'primary'"
                height="8"
                rounded
                style="min-width: 60px;"
              />
              <div class="text-caption text-no-wrap">
                {{ getStudentProgress(item) }}%
                <span class="text-medium-emphasis">({{ item._responseCount || 0 }}/{{ item._totalStudents || 0 }})</span>
              </div>
            </div>
          </template>

          <template #[`item.actions`]="{ item }">
            <div class="d-flex justify-center gap-1">
              <IconBtn size="small" @click.stop="goToStudentSurvey(item)">
                <VIcon icon="ri-pencil-line" />
              </IconBtn>
              <IconBtn size="small" color="error" @click.stop="openStudentDeleteDialog(item)">
                <VIcon icon="ri-delete-bin-line" />
              </IconBtn>
            </div>
          </template>

          <template #no-data>
            <div class="text-center pa-8">
              <VIcon icon="ri-emotion-happy-line" size="64" color="medium-emphasis" class="mb-4" />
              <p class="text-h6 text-medium-emphasis mb-2">No Student Satisfaction Surveys</p>
            </div>
          </template>
        </VDataTable>
      </template>

      <!-- ==================== DEAN EVALUATION TAB ==================== -->
      <template v-else>
        <div class="d-flex align-center pa-4 gap-4">
          <VTextField
            v-model="deanSearch"
            prepend-inner-icon="ri-search-line"
            placeholder="Search evaluations..."
            density="compact"
            variant="outlined"
            hide-details
            style="max-width: 300px;"
          />
          <VSelect
            v-model="deanTypeFilter"
            :items="surveyTypeOptions"
            item-title="title"
            item-value="value"
            label="Type"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            style="max-width: 180px;"
          />
          <VSelect
            v-model="deanStatusFilter"
            :items="statusOptions"
            item-title="title"
            item-value="value"
            label="Status"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            style="max-width: 150px;"
          />
          <VSpacer />
          <VBtn color="primary" prepend-icon="ri-add-line" @click="openDeanCreateDialog">
            Create Evaluation
          </VBtn>
        </div>

        <VDivider />

        <VDataTable
          :headers="deanHeaders"
          :items="filteredDeanSurveys"
          :loading="isLoading"
          hover
          class="clickable-rows"
          @click:row="handleDeanRowClick"
        >
          <template #[`item.title`]="{ item }">
            <a
              class="font-weight-medium text-primary cursor-pointer text-decoration-none"
              @click="goToDeanSurvey(item)"
            >
              {{ item.title }}
            </a>
          </template>

          <template #[`item.survey_type`]="{ item }">
            <VChip :color="getSurveyTypeColor(item.survey_type)" size="small" variant="tonal">
              {{ getSurveyTypeLabel(item.survey_type) }}
            </VChip>
          </template>

          <template #[`item.acadTerm`]="{ item }">
            <VChip size="small" variant="tonal" color="secondary">
              {{ getAcademicTermDisplay(item) }}
            </VChip>
          </template>

          <template #[`item.is_active`]="{ item }">
            <VChip :color="getStatusColor(item.is_active)" size="small" variant="tonal">
              {{ item.is_active }}
            </VChip>
          </template>

          <template #[`item.questions`]="{ item }">
            <VChip size="small" variant="tonal" color="info">
              {{ getDeanQuestionsCount(item) }}
            </VChip>
          </template>

          <template #[`item.progress`]="{ item }">
            <div class="d-flex align-center gap-2" style="min-width: 140px;">
              <VProgressLinear
                :model-value="getDeanProgress(item)"
                :color="getDeanProgress(item) >= 75 ? 'success' : getDeanProgress(item) >= 50 ? 'warning' : 'primary'"
                height="8"
                rounded
                style="min-width: 60px;"
              />
              <div class="text-caption text-no-wrap">
                {{ getDeanProgress(item) }}%
                <span class="text-medium-emphasis">({{ item._responseCount || 0 }}/{{ item._totalExpected || 0 }})</span>
              </div>
            </div>
          </template>

          <template #[`item.actions`]="{ item }">
            <div class="d-flex justify-center gap-1">
              <IconBtn size="small" @click.stop="goToDeanSurvey(item)">
                <VIcon icon="ri-pencil-line" />
              </IconBtn>
              <IconBtn size="small" color="error" @click.stop="openDeanDeleteDialog(item)">
                <VIcon icon="ri-delete-bin-line" />
              </IconBtn>
            </div>
          </template>

          <template #no-data>
            <div class="text-center pa-8">
              <VIcon icon="ri-user-settings-line" size="64" color="medium-emphasis" class="mb-4" />
              <p class="text-h6 text-medium-emphasis mb-2">No Dean Evaluations</p>
              <p class="text-body-2 text-medium-emphasis mb-4">Create your first evaluation to start collecting feedback</p>
              <VBtn color="primary" prepend-icon="ri-add-line" @click="openDeanCreateDialog">
                Create Evaluation
              </VBtn>
            </div>
          </template>
        </VDataTable>
      </template>
    </VCard>

    <!-- ==================== STUDENT SURVEY DIALOGS ==================== -->

    <!-- Delete Student Survey Dialog -->
    <VDialog v-model="isStudentDeleteDialogOpen" max-width="400">
      <VCard>
        <VCardTitle class="pa-6">Delete Survey</VCardTitle>
        <VDivider />
        <VCardText class="pa-6">
          Are you sure you want to delete <strong>{{ selectedStudentSurvey?.title }}</strong>?
          This action cannot be undone.
        </VCardText>
        <VDivider />
        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="isStudentDeleteDialogOpen = false">Cancel</VBtn>
          <VBtn color="error" @click="deleteStudentSurvey">Delete</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Create Student Survey Dialog -->
    <VDialog v-model="isStudentCreateDialogOpen" max-width="700" persistent>
      <VCard>
        <VCardTitle class="pa-6">
          Create New Survey
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VRow>
            <VCol cols="12" md="8">
              <VTextField
                v-model="studentForm.title"
                label="Survey Title"
                placeholder="Enter survey title"
                variant="outlined"
                :rules="[v => !!v || 'Title is required']"
              />
            </VCol>

            <VCol cols="12" md="4">
              <VSelect
                v-model="studentForm.is_active"
                :items="statusOptions"
                item-title="title"
                item-value="value"
                label="Status"
                variant="outlined"
              />
            </VCol>

            <VCol cols="12">
              <VTextarea
                v-model="studentForm.description"
                label="Description"
                placeholder="Enter survey description"
                variant="outlined"
                rows="2"
              />
            </VCol>

            <VCol cols="12">
              <VTextarea
                v-model="studentForm.instruction"
                label="Instructions"
                placeholder="Enter instructions for respondents"
                variant="outlined"
                rows="2"
              />
            </VCol>

            <VCol cols="12" md="4">
              <VSelect
                v-model="studentForm.academic_term_id"
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
                v-model="studentForm.survey_start"
                label="Start Date"
                type="date"
                variant="outlined"
              />
            </VCol>

            <VCol cols="12" md="4">
              <VTextField
                v-model="studentForm.survey_end"
                label="End Date"
                type="date"
                variant="outlined"
              />
            </VCol>
          </VRow>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="isStudentCreateDialogOpen = false">
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :loading="isStudentSaving"
            :disabled="!studentForm.title.trim()"
            @click="saveStudentSurvey"
          >
            Create
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- ==================== DEAN SURVEY DIALOGS ==================== -->

    <!-- Delete Dean Survey Dialog -->
    <VDialog v-model="isDeanDeleteDialogOpen" max-width="400">
      <VCard>
        <VCardTitle class="pa-6">Delete Evaluation</VCardTitle>
        <VDivider />
        <VCardText class="pa-6">
          Are you sure you want to delete <strong>{{ selectedDeanSurvey?.title }}</strong>?
          This action cannot be undone.
        </VCardText>
        <VDivider />
        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="isDeanDeleteDialogOpen = false">Cancel</VBtn>
          <VBtn color="error" @click="deleteDeanSurvey">Delete</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Create Dean Survey Dialog -->
    <VDialog v-model="isDeanCreateDialogOpen" max-width="700" persistent>
      <VCard>
        <VCardTitle class="pa-6">
          Create New Dean Evaluation
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VRow>
            <VCol cols="12" md="8">
              <VTextField
                v-model="deanForm.title"
                label="Evaluation Title"
                placeholder="Enter evaluation title"
                variant="outlined"
                :rules="[v => !!v || 'Title is required']"
              />
            </VCol>

            <VCol cols="12" md="4">
              <VSelect
                v-model="deanForm.is_active"
                :items="statusOptions"
                item-title="title"
                item-value="value"
                label="Status"
                variant="outlined"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VSelect
                v-model="deanForm.survey_type"
                :items="surveyTypeOptions"
                item-title="title"
                item-value="value"
                label="Evaluation Type"
                variant="outlined"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VSelect
                v-model="deanForm.academic_term_id"
                :items="academicTerms"
                :item-title="(item) => `${item.semester} - ${item.schoolYear}`"
                item-value="id"
                label="Academic Term"
                variant="outlined"
                clearable
              />
            </VCol>

            <VCol cols="12">
              <VTextarea
                v-model="deanForm.description"
                label="Description"
                placeholder="Enter evaluation description"
                variant="outlined"
                rows="2"
              />
            </VCol>

            <VCol cols="12">
              <VTextarea
                v-model="deanForm.instruction"
                label="Instructions"
                placeholder="Enter instructions for deans"
                variant="outlined"
                rows="2"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VTextField
                v-model="deanForm.survey_start"
                label="Start Date"
                type="date"
                variant="outlined"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VTextField
                v-model="deanForm.survey_end"
                label="End Date"
                type="date"
                variant="outlined"
              />
            </VCol>
          </VRow>

          <!-- Survey Type Info -->
          <VAlert
            v-if="deanForm.survey_type"
            :color="deanForm.survey_type === 'faculty_evaluation' ? 'info' : 'warning'"
            variant="tonal"
            class="mt-4"
          >
            <template #title>
              {{ deanForm.survey_type === 'faculty_evaluation' ? 'Faculty Evaluation' : 'Program Assessment' }}
            </template>
            <template v-if="deanForm.survey_type === 'faculty_evaluation'">
              Deans will evaluate each faculty member (professor) in their department individually.
            </template>
            <template v-else>
              Deans will evaluate programs such as departmental budget proposals and other program-related assessments.
            </template>
          </VAlert>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="isDeanCreateDialogOpen = false">
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :loading="isDeanSaving"
            :disabled="!deanForm.title.trim()"
            @click="saveDeanSurvey"
          >
            Create
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>

<style scoped>
.clickable-rows :deep(tbody tr) {
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.clickable-rows :deep(tbody tr:hover) {
  background-color: rgba(var(--v-theme-primary), 0.04) !important;
}
</style>
