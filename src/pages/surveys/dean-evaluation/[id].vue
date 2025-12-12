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
  instruction: string
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
  evaluated_teached_id?: { id: number; first_name: string; last_name: string } | number | null
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

interface TeacherReport {
  teacherId: number
  teacherName: string
  deanName: string
  submittedAt: string
  responseId: number
  answers: {
    groupTitle: string
    questionText: string
    answerValue: string
    responseStyle: string
  }[]
}

interface TeacherItem {
  id: number
  first_name: string
  last_name: string
  position?: string
  is_active?: string
}

interface DeanItem {
  id: number
  first_name: string
  last_name: string
  position: string
  is_active: string
  departmentId?: number
  departmentName?: string
  teachersToEvaluate?: TeacherItem[]
  evaluatedTeacherIds?: number[]
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
const academicTerms = ref<AcademicTerm[]>([])
const responses = ref<DeanResponse[]>([])
const questionStats = ref<QuestionStats[]>([])

// Export report state
const showExportDialog = ref(false)
const selectedTeacherReport = ref<TeacherReport | null>(null)

// Teacher selection state (for teachers to evaluate)
const availableTeachers = ref<TeacherItem[]>([])
const assignedTeacherIds = ref<number[]>([])
const teacherSearch = ref('')
const isLoadingTeachers = ref(false)
const activeDeanCount = ref(0)

const form = ref<DeanSurveyForm>({
  title: '',
  instruction: '',
  survey_start: '',
  survey_end: '',
  is_active: 'Draft',
  academic_term_id: null,
  question_groups: [],
})

// Date picker menu state
const startDateMenu = ref(false)
const endDateMenu = ref(false)

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

const responseStyleOptions = ref<{ title: string; value: string }[]>([])

// Fetch response style options from Directus
const fetchResponseStyleOptions = async () => {
  try {
    const res = await $api('/fields/DeanSurveyGroup/response_style')
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
      { title: 'Likert-Scale Questions', value: 'Likert-Scale Questions' },
      { title: 'Rating-Scale Questions', value: 'Rating-Scale Questions' },
      { title: 'Open-Ended Question', value: 'Open-Ended Quesrion' },
    ]
  }
}

// Format datetime for input field (YYYY-MM-DDTHH:mm)
const formatDateForInput = (dateStr: string | null): string => {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return ''
    // Format for datetime-local input: YYYY-MM-DDTHH:mm
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
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

// Date picker computed properties
const startDateValue = computed({
  get: () => form.value.survey_start ? new Date(form.value.survey_start) : null,
  set: (val: Date | null) => {
    if (val) {
      const existing = form.value.survey_start ? new Date(form.value.survey_start) : null
      if (existing) {
        val.setHours(existing.getHours(), existing.getMinutes())
      }
      form.value.survey_start = val.toISOString()
    }
    else {
      form.value.survey_start = ''
    }
  },
})

const endDateValue = computed({
  get: () => form.value.survey_end ? new Date(form.value.survey_end) : null,
  set: (val: Date | null) => {
    if (val) {
      const existing = form.value.survey_end ? new Date(form.value.survey_end) : null
      if (existing) {
        val.setHours(existing.getHours(), existing.getMinutes())
      }
      else {
        val.setHours(23, 59)
      }
      form.value.survey_end = val.toISOString()
    }
    else {
      form.value.survey_end = ''
    }
  },
})

const startTimeValue = computed({
  get: () => {
    if (!form.value.survey_start) return '00:00'
    const date = new Date(form.value.survey_start)
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  },
  set: (val: string) => {
    if (!form.value.survey_start) {
      const now = new Date()
      form.value.survey_start = now.toISOString()
    }
    const [hours, minutes] = val.split(':').map(Number)
    const date = new Date(form.value.survey_start)
    date.setHours(hours, minutes)
    form.value.survey_start = date.toISOString()
  },
})

const endTimeValue = computed({
  get: () => {
    if (!form.value.survey_end) return '23:59'
    const date = new Date(form.value.survey_end)
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  },
  set: (val: string) => {
    if (!form.value.survey_end) {
      const now = new Date()
      form.value.survey_end = now.toISOString()
    }
    const [hours, minutes] = val.split(':').map(Number)
    const date = new Date(form.value.survey_end)
    date.setHours(hours, minutes)
    form.value.survey_end = date.toISOString()
  },
})

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
  if (!surveyId.value || isNaN(surveyId.value)) {
    console.warn('Invalid survey ID, skipping fetch')
    isLoading.value = false
    return
  }

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
      instruction: data.instruction || '',
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
  if (!surveyId.value || isNaN(surveyId.value)) {
    console.warn('Invalid survey ID, skipping fetch responses')
    isLoadingResponses.value = false
    return
  }

  isLoadingResponses.value = true
  try {
    const res = await $api('/items/DeanSurveyResponses', {
      params: {
        filter: { survey_id: { _eq: surveyId.value } },
        fields: ['*', 'dean_id.*', 'evaluated_teached_id.*', 'department_id.*', 'department_id.name.*', 'answers.*', 'answers.question_id.*'],
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

// Fetch available teachers (professors) who can be evaluated
const fetchAvailableTeachers = async () => {
  isLoadingTeachers.value = true
  try {
    // Fetch all active teachers (non-deans) who can be evaluated
    const teachersRes = await $api('/items/Teachers', {
      params: {
        filter: {
          is_active: { _eq: 'Active' },
          position: { _neq: 'Dean' },
        },
        fields: ['id', 'first_name', 'last_name', 'position', 'is_active'],
        sort: ['last_name', 'first_name'],
        limit: -1,
      },
    })

    // Fetch departments to map department names to teachers
    const deptsRes = await $api('/items/Department', {
      params: {
        fields: ['id', 'name.*', 'teacher_id.Teachers_id'],
        limit: -1,
      },
    })

    // Count active deans for info display
    const deansRes = await $api('/items/Teachers', {
      params: {
        filter: {
          position: { _eq: 'Dean' },
          is_active: { _eq: 'Active' },
        },
        aggregate: { count: '*' },
      },
    })
    activeDeanCount.value = Number(deansRes.data?.[0]?.count) || 0

    const departments = deptsRes.data || []
    const teachers: (TeacherItem & { departmentName?: string })[] = teachersRes.data || []

    // Map department names to teachers
    for (const teacher of teachers) {
      for (const dept of departments) {
        const teacherIds = dept.teacher_id || []
        const isInDept = teacherIds.some((t: any) => {
          const tid = t.Teachers_id ?? t.id ?? t
          return tid === teacher.id || (typeof tid === 'object' && tid?.id === teacher.id)
        })
        if (isInDept && typeof dept.name === 'object' && dept.name) {
          (teacher as any).departmentName = dept.name.programCode || dept.name.programName
          break
        }
      }
    }

    availableTeachers.value = teachers
  }
  catch (error) {
    console.error('Failed to fetch teachers:', error)
    availableTeachers.value = []
  }
  finally {
    isLoadingTeachers.value = false
  }
}

// Fetch teachers already assigned to this survey
const fetchAssignedTeachers = async () => {
  if (!surveyId.value || isNaN(surveyId.value)) {
    console.warn('Invalid survey ID, skipping fetch assigned teachers')
    return
  }

  try {
    const res = await $api(`/items/DeanEvaluationSurvey/${surveyId.value}`, {
      params: {
        fields: ['teachers_to_evaluate.Teachers_id.id'],
      },
    })

    const teacherAssignments = res.data?.teachers_to_evaluate || []
    assignedTeacherIds.value = teacherAssignments
      .map((t: any) => {
        if (typeof t.Teachers_id === 'object' && t.Teachers_id !== null) {
          return t.Teachers_id.id
        }
        return t.Teachers_id
      })
      .filter((id: any) => id != null && typeof id === 'number')
  }
  catch (error) {
    console.error('Failed to fetch assigned teachers:', error)
    assignedTeacherIds.value = []
  }
}

// Filtered teachers based on search
const filteredTeachers = computed(() => {
  if (!teacherSearch.value) return availableTeachers.value
  const search = teacherSearch.value.toLowerCase()
  return availableTeachers.value.filter((t: any) => {
    const fullName = `${t.first_name} ${t.last_name}`.toLowerCase()
    const deptName = t.departmentName?.toLowerCase() || ''
    return fullName.includes(search) || deptName.includes(search)
  })
})

// Toggle teacher assignment
const toggleTeacherAssignment = (teacherId: number) => {
  const index = assignedTeacherIds.value.indexOf(teacherId)
  if (index === -1) {
    assignedTeacherIds.value.push(teacherId)
  }
  else {
    assignedTeacherIds.value.splice(index, 1)
  }
}

// Check if teacher is assigned
const isTeacherAssigned = (teacherId: number): boolean => {
  return assignedTeacherIds.value.includes(teacherId)
}

// Get teacher display name
const getTeacherDisplayName = (t: TeacherItem): string => {
  return `${t.last_name}, ${t.first_name}`
}

// Select all teachers
const selectAllTeachers = () => {
  assignedTeacherIds.value = availableTeachers.value.map(t => t.id)
}

// Deselect all teachers
const deselectAllTeachers = () => {
  assignedTeacherIds.value = []
}

// Get color for average score
const getAverageColor = (avg: number): string => {
  if (avg >= 4) return 'success'
  if (avg >= 3) return 'warning'
  return 'error'
}

// Get unique evaluated teachers from responses
const evaluatedTeachers = computed(() => {
  const teacherMap = new Map<number, { id: number; name: string; responseId: number }>()

  for (const response of responses.value) {
    if (!response.evaluated_teached_id) continue
    const teacherId = typeof response.evaluated_teached_id === 'object'
      ? response.evaluated_teached_id.id
      : response.evaluated_teached_id
    const teacherName = typeof response.evaluated_teached_id === 'object'
      ? `${response.evaluated_teached_id.first_name} ${response.evaluated_teached_id.last_name}`
      : `Teacher #${teacherId}`

    if (!teacherMap.has(teacherId)) {
      teacherMap.set(teacherId, { id: teacherId, name: teacherName, responseId: response.id })
    }
  }

  return Array.from(teacherMap.values()).sort((a, b) => a.name.localeCompare(b.name))
})

// Generate report for a specific teacher
const generateTeacherReport = (teacherId: number): TeacherReport | null => {
  const response = responses.value.find(r => {
    const tid = typeof r.evaluated_teached_id === 'object'
      ? r.evaluated_teached_id?.id
      : r.evaluated_teached_id
    return tid === teacherId
  })

  if (!response) return null

  const teacherName = typeof response.evaluated_teached_id === 'object' && response.evaluated_teached_id
    ? `${response.evaluated_teached_id.first_name} ${response.evaluated_teached_id.last_name}`
    : `Teacher #${teacherId}`

  const deanName = typeof response.dean_id === 'object'
    ? `${response.dean_id.first_name} ${response.dean_id.last_name}`
    : `Dean #${response.dean_id}`

  // Build answers with question details
  const answersList: TeacherReport['answers'] = []

  for (const group of form.value.question_groups) {
    for (const question of group.questions || []) {
      if (!question.id) continue

      // Find the answer for this question
      const answer = response.answers?.find(a => {
        const qid = typeof a.question_id === 'object' ? a.question_id.id : a.question_id
        return qid === question.id
      })

      if (answer) {
        answersList.push({
          groupTitle: group.title,
          questionText: question.question,
          answerValue: answer.answer_value,
          responseStyle: group.response_style,
        })
      }
    }
  }

  return {
    teacherId,
    teacherName,
    deanName,
    submittedAt: response.submitted_at,
    responseId: response.id,
    answers: answersList,
  }
}

// View teacher report
const viewTeacherReport = (teacherId: number) => {
  const report = generateTeacherReport(teacherId)
  if (report) {
    selectedTeacherReport.value = report
    showExportDialog.value = true
  }
}

// Get rating label based on response style
const getRatingLabel = (value: string, responseStyle: string): string => {
  const numValue = parseInt(value)
  if (isNaN(numValue)) return value

  // For Likert/Rating scale questions
  if (responseStyle.includes('Likert') || responseStyle.includes('Rating')) {
    const labels: Record<number, string> = {
      5: 'Outstanding / Always Manifested',
      4: 'Very Satisfactory / Often Manifested',
      3: 'Satisfactory / Sometimes Manifested',
      2: 'Unsatisfactory / Seldom Manifested',
      1: 'Poor / Never Manifested',
    }
    return labels[numValue] || value
  }

  return value
}

// Print the report
const printReport = () => {
  window.print()
}

// Format date for CSV (no commas)
const formatDateForCSV = (dateStr: string): string => {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }) + ' ' + new Date(dateStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }).replace(',', '')
  }
  catch {
    return dateStr
  }
}

// Export as CSV
const exportReportAsCSV = () => {
  if (!selectedTeacherReport.value) return

  const report = selectedTeacherReport.value

  // Escape CSV values - always quote to handle any special characters
  const escapeCSV = (value: string): string => {
    return `"${String(value).replace(/"/g, '""')}"`
  }

  // Build CSV content with header info section first
  let csv = ''

  // Header information (single occurrence)
  csv += `${escapeCSV('DEAN EVALUATION REPORT')}\n`
  csv += `\n`
  csv += `${escapeCSV('Survey')},${escapeCSV(form.value.title)}\n`
  csv += `${escapeCSV('Faculty Member')},${escapeCSV(report.teacherName)}\n`
  csv += `${escapeCSV('Evaluated By')},${escapeCSV(report.deanName)}\n`
  csv += `${escapeCSV('Submitted Date')},${escapeCSV(formatDateForCSV(report.submittedAt))}\n`
  csv += `\n`

  // Question table headers
  csv += `${escapeCSV('Group')},${escapeCSV('Question')},${escapeCSV('Rating')},${escapeCSV('Interpretation')}\n`

  // Question rows
  for (const answer of report.answers) {
    const interpretation = (answer.responseStyle.includes('Likert') || answer.responseStyle.includes('Rating'))
      ? getRatingLabel(answer.answerValue, answer.responseStyle)
      : answer.answerValue

    csv += `${escapeCSV(answer.groupTitle)},${escapeCSV(answer.questionText)},${escapeCSV(answer.answerValue)},${escapeCSV(interpretation)}\n`
  }

  // Create and download the file
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `evaluation-${report.teacherName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
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
  if (!response.evaluated_teached_id) return '-'
  if (typeof response.evaluated_teached_id === 'object' && response.evaluated_teached_id !== null) {
    return `${response.evaluated_teached_id.last_name}, ${response.evaluated_teached_id.first_name}`
  }
  return `Teacher #${response.evaluated_teached_id}`
}

// Question Group Management
const addQuestionGroup = () => {
  form.value.question_groups.push({
    number: form.value.question_groups.length + 1,
    title: '',
    response_style: 'Likert-Scale Questions',
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
  if (!surveyId.value || isNaN(surveyId.value)) {
    snackbar.value = { show: true, message: 'Invalid survey ID', color: 'error' }
    return
  }

  if (!form.value.title.trim()) {
    snackbar.value = { show: true, message: 'Please enter a survey title', color: 'error' }
    return
  }

  isSaving.value = true
  try {
    // Build the teachers_to_evaluate M2M data
    const teachersToEvaluate = assignedTeacherIds.value.map(id => ({
      Teachers_id: id,
    }))

    // Build the request body with teachers_to_evaluate
    const requestBody: any = {
      title: form.value.title,
      instruction: form.value.instruction,
      survey_start: form.value.survey_start || null,
      survey_end: form.value.survey_end || null,
      is_active: form.value.is_active,
      academic_term_id: form.value.academic_term_id,
      question_groups: form.value.question_groups.length > 0 ? form.value.question_groups : undefined,
      teachers_to_evaluate: teachersToEvaluate,
    }

    await $api(`/items/DeanEvaluationSurvey/${surveyId.value}`, {
      method: 'PATCH',
      body: requestBody,
    })

    snackbar.value = { show: true, message: 'Evaluation saved successfully!', color: 'success' }
    router.push('/surveys/dean-evaluation')
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
  router.push('/surveys/dean-evaluation')
}

// Go to detailed responses page
const goToDetailedResponses = () => {
  router.push(`/surveys/dean-evaluation/${surveyId.value}-responses`)
}

// Watch tab changes
watch(activeTab, (newTab) => {
  if (newTab === 'responses' && responses.value.length === 0) {
    fetchResponses()
  }
  if (newTab === 'assignment' && availableTeachers.value.length === 0) {
    fetchAvailableTeachers()
    fetchAssignedTeachers()
  }
})

onMounted(() => {
  fetchResponseStyleOptions()
  fetchAcademicTerms()
  fetchSurveyDetails()
  fetchAssignedTeachers()
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
          Teachers
          <VChip v-if="assignedTeacherIds.length > 0" size="x-small" color="success" class="ms-2">
            {{ assignedTeacherIds.length }}
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

              <VCol cols="12" md="8">
                <VTextField
                  v-model="form.title"
                  label="Evaluation Title"
                  placeholder="Enter evaluation title"
                  variant="outlined"
                  :rules="[v => !!v || 'Title is required']"
                />
              </VCol>

              <VCol cols="12" md="4">
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

              <!-- Start Date & Time -->
              <VCol cols="12" md="4">
                <VMenu
                  v-model="startDateMenu"
                  :close-on-content-click="false"
                  location="bottom start"
                >
                  <template #activator="{ props }">
                    <VTextField
                      v-bind="props"
                      :model-value="formatDateDisplay(form.survey_start)"
                      label="Start Date & Time"
                      variant="outlined"
                      prepend-inner-icon="ri-calendar-line"
                      readonly
                      clearable
                      @click:clear="form.survey_start = ''"
                    />
                  </template>
                  <VCard min-width="300">
                    <VDatePicker
                      v-model="startDateValue"
                      show-adjacent-months
                      hide-header
                    />
                    <VDivider />
                    <div class="pa-3">
                      <VTextField
                        v-model="startTimeValue"
                        label="Time"
                        type="time"
                        variant="outlined"
                        density="compact"
                        hide-details
                      />
                    </div>
                    <VCardActions>
                      <VSpacer />
                      <VBtn variant="text" @click="startDateMenu = false">Done</VBtn>
                    </VCardActions>
                  </VCard>
                </VMenu>
              </VCol>

              <!-- End Date & Time -->
              <VCol cols="12" md="4">
                <VMenu
                  v-model="endDateMenu"
                  :close-on-content-click="false"
                  location="bottom start"
                >
                  <template #activator="{ props }">
                    <VTextField
                      v-bind="props"
                      :model-value="formatDateDisplay(form.survey_end)"
                      label="End Date & Time"
                      variant="outlined"
                      prepend-inner-icon="ri-calendar-line"
                      readonly
                      clearable
                      @click:clear="form.survey_end = ''"
                    />
                  </template>
                  <VCard min-width="300">
                    <VDatePicker
                      v-model="endDateValue"
                      show-adjacent-months
                      hide-header
                    />
                    <VDivider />
                    <div class="pa-3">
                      <VTextField
                        v-model="endTimeValue"
                        label="Time"
                        type="time"
                        variant="outlined"
                        density="compact"
                        hide-details
                      />
                    </div>
                    <VCardActions>
                      <VSpacer />
                      <VBtn variant="text" @click="endDateMenu = false">Done</VBtn>
                    </VCardActions>
                  </VCard>
                </VMenu>
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
                          label="Group Title"
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

      <!-- Assignment Tab - Teachers to Evaluate -->
      <template v-else-if="activeTab === 'assignment'">
        <VCardText class="pa-6">
          <!-- Loading -->
          <div v-if="isLoadingTeachers" class="d-flex justify-center align-center pa-12">
            <VProgressCircular indeterminate color="primary" />
            <span class="ms-4">Loading teachers...</span>
          </div>

          <template v-else>
            <!-- Info Alert -->
            <VAlert type="info" variant="tonal" class="mb-6">
              <template #title>Teacher Assignment for Dean Evaluation</template>
              <p class="mb-2">
                Select which teachers (faculty members) should be evaluated by deans for this survey.
              </p>
              <p class="text-body-2 mb-0">
                <strong>Note:</strong> All {{ activeDeanCount }} active dean(s) will evaluate the selected teachers.
                Total expected evaluations: {{ activeDeanCount * assignedTeacherIds.length }}.
              </p>
            </VAlert>

            <!-- Summary Cards -->
            <VRow class="mb-6">
              <VCol cols="12" md="4">
                <VCard variant="tonal" color="primary">
                  <VCardText class="d-flex align-center justify-space-between">
                    <div>
                      <p class="text-overline mb-1">Available Teachers</p>
                      <p class="text-h4 font-weight-bold">{{ availableTeachers.length }}</p>
                    </div>
                    <VAvatar color="primary" size="48">
                      <VIcon icon="ri-user-line" size="24" />
                    </VAvatar>
                  </VCardText>
                </VCard>
              </VCol>

              <VCol cols="12" md="4">
                <VCard variant="tonal" color="success">
                  <VCardText class="d-flex align-center justify-space-between">
                    <div>
                      <p class="text-overline mb-1">Selected for Evaluation</p>
                      <p class="text-h4 font-weight-bold">{{ assignedTeacherIds.length }}</p>
                    </div>
                    <VAvatar color="success" size="48">
                      <VIcon icon="ri-checkbox-circle-line" size="24" />
                    </VAvatar>
                  </VCardText>
                </VCard>
              </VCol>

              <VCol cols="12" md="4">
                <VCard variant="tonal" color="info">
                  <VCardText class="d-flex align-center justify-space-between">
                    <div>
                      <p class="text-overline mb-1">Active Deans</p>
                      <p class="text-h4 font-weight-bold">{{ activeDeanCount }}</p>
                    </div>
                    <VAvatar color="info" size="48">
                      <VIcon icon="ri-user-star-line" size="24" />
                    </VAvatar>
                  </VCardText>
                </VCard>
              </VCol>
            </VRow>

            <!-- Search and Actions -->
            <div class="d-flex align-center gap-4 mb-4">
              <VTextField
                v-model="teacherSearch"
                prepend-inner-icon="ri-search-line"
                placeholder="Search teachers by name..."
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
                @click="selectAllTeachers"
              >
                Select All
              </VBtn>
              <VBtn
                variant="outlined"
                color="secondary"
                size="small"
                prepend-icon="ri-checkbox-blank-line"
                @click="deselectAllTeachers"
              >
                Deselect All
              </VBtn>
            </div>

            <!-- No Teachers -->
            <div v-if="availableTeachers.length === 0" class="text-center pa-12">
              <VIcon icon="ri-user-line" size="64" color="medium-emphasis" class="mb-4" />
              <p class="text-h6 text-medium-emphasis mb-2">No Teachers Available</p>
              <p class="text-body-2 text-medium-emphasis">
                Add active teachers (non-deans) to your system to assign them for evaluation.
              </p>
            </div>

            <!-- Teachers Table -->
            <VCard v-else variant="outlined">
              <VTable>
                <thead>
                  <tr>
                    <th style="width: 60px;">
                      <VCheckbox
                        :model-value="assignedTeacherIds.length === filteredTeachers.length && filteredTeachers.length > 0"
                        :indeterminate="assignedTeacherIds.length > 0 && assignedTeacherIds.length < filteredTeachers.length"
                        hide-details
                        density="compact"
                        @change="assignedTeacherIds.length === filteredTeachers.length ? deselectAllTeachers() : selectAllTeachers()"
                      />
                    </th>
                    <th>Teacher Name</th>
                    <th>Position</th>
                    <th>Department</th>
                    <th class="text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="teacher in filteredTeachers"
                    :key="teacher.id"
                    class="cursor-pointer"
                    @click="toggleTeacherAssignment(teacher.id)"
                  >
                    <td>
                      <VCheckbox
                        :model-value="isTeacherAssigned(teacher.id)"
                        hide-details
                        density="compact"
                        @click.stop="toggleTeacherAssignment(teacher.id)"
                      />
                    </td>
                    <td>
                      <span class="font-weight-medium">{{ getTeacherDisplayName(teacher) }}</span>
                    </td>
                    <td>
                      <VChip size="x-small" variant="tonal" color="secondary">
                        {{ teacher.position || 'N/A' }}
                      </VChip>
                    </td>
                    <td>
                      <span class="text-body-2">{{ teacher.departmentName || 'No Department' }}</span>
                    </td>
                    <td class="text-center">
                      <VChip
                        v-if="isTeacherAssigned(teacher.id)"
                        size="small"
                        color="success"
                        variant="tonal"
                      >
                        <VIcon icon="ri-check-line" size="14" class="me-1" />
                        Selected
                      </VChip>
                      <VChip
                        v-else
                        size="small"
                        color="secondary"
                        variant="outlined"
                      >
                        Not Selected
                      </VChip>
                    </td>
                  </tr>
                </tbody>
              </VTable>

              <!-- No search results -->
              <div v-if="filteredTeachers.length === 0" class="text-center pa-8">
                <VIcon icon="ri-search-line" size="48" color="medium-emphasis" class="mb-4" />
                <p class="text-body-1 text-medium-emphasis">No teachers match your search</p>
              </div>
            </VCard>
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

            <!-- Export Teacher Reports Section -->
            <div class="d-flex align-center justify-space-between mb-4 mt-6">
              <h6 class="text-h6">Export Teacher Reports</h6>
              <VChip size="small" color="info" variant="tonal">
                {{ evaluatedTeachers.length }} teachers evaluated
              </VChip>
            </div>

            <VCard v-if="evaluatedTeachers.length > 0" variant="outlined" class="mb-6">
              <VTable density="comfortable">
                <thead>
                  <tr>
                    <th>Faculty Member</th>
                    <th class="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="teacher in evaluatedTeachers" :key="teacher.id">
                    <td>
                      <div class="d-flex align-center gap-3">
                        <VAvatar color="primary" variant="tonal" size="36">
                          <VIcon icon="ri-user-line" size="18" />
                        </VAvatar>
                        <span class="font-weight-medium">{{ teacher.name }}</span>
                      </div>
                    </td>
                    <td class="text-center">
                      <VBtn
                        color="primary"
                        variant="tonal"
                        size="small"
                        prepend-icon="ri-file-list-3-line"
                        @click="viewTeacherReport(teacher.id)"
                      >
                        View Report
                      </VBtn>
                    </td>
                  </tr>
                </tbody>
              </VTable>
            </VCard>

            <VAlert v-else type="info" variant="tonal" class="mb-6">
              No evaluated teachers found. Teacher reports will appear here after evaluations are submitted.
            </VAlert>

            <!-- Recent Responses -->
            <h6 class="text-h6 mb-4 mt-6">Recent Responses</h6>
            <VTable density="comfortable">
              <thead>
                <tr>
                  <th>Dean</th>
                  <th>Evaluated Teacher</th>
                  <th>Submitted At</th>
                  <th class="text-center">Answers</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="response in responses.slice(0, 5)" :key="response.id">
                  <td>{{ getDeanName(response) }}</td>
                  <td>{{ getEvaluatedTeacher(response) }}</td>
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

    <!-- Export Report Dialog -->
    <VDialog v-model="showExportDialog" max-width="800" scrollable>
      <VCard v-if="selectedTeacherReport">
        <VCardTitle class="d-flex align-center justify-space-between pa-4 no-print">
          <span class="text-h6">Evaluation Report</span>
          <div class="d-flex gap-2">
            <VBtn
              variant="tonal"
              color="secondary"
              size="small"
              prepend-icon="ri-download-line"
              @click="exportReportAsCSV"
            >
              Export CSV
            </VBtn>
            <VBtn
              variant="tonal"
              color="primary"
              size="small"
              prepend-icon="ri-printer-line"
              @click="printReport"
            >
              Print
            </VBtn>
            <VBtn icon variant="text" size="small" @click="showExportDialog = false">
              <VIcon icon="ri-close-line" />
            </VBtn>
          </div>
        </VCardTitle>

        <VDivider class="no-print" />

        <VCardText class="pa-6 print-content">
          <!-- Report Header -->
          <div class="text-center mb-6">
            <h4 class="text-h4 font-weight-bold mb-2">Dean Evaluation Report</h4>
            <p class="text-body-1 text-medium-emphasis">{{ form.title }}</p>
          </div>

          <VDivider class="mb-6" />

          <!-- Faculty Information -->
          <VRow class="mb-6">
            <VCol cols="12" md="6">
              <div class="d-flex align-center gap-3 mb-4">
                <VAvatar color="primary" variant="tonal" size="48">
                  <VIcon icon="ri-user-line" size="24" />
                </VAvatar>
                <div>
                  <p class="text-overline text-medium-emphasis mb-0">Faculty Member</p>
                  <p class="text-h6 font-weight-medium mb-0">{{ selectedTeacherReport.teacherName }}</p>
                </div>
              </div>
            </VCol>
            <VCol cols="12" md="6">
              <div class="d-flex align-center gap-3 mb-4">
                <VAvatar color="info" variant="tonal" size="48">
                  <VIcon icon="ri-user-star-line" size="24" />
                </VAvatar>
                <div>
                  <p class="text-overline text-medium-emphasis mb-0">Evaluated By</p>
                  <p class="text-h6 font-weight-medium mb-0">{{ selectedTeacherReport.deanName }}</p>
                </div>
              </div>
            </VCol>
            <VCol cols="12">
              <p class="text-body-2 text-medium-emphasis">
                <VIcon icon="ri-calendar-line" size="16" class="me-1" />
                Submitted: {{ formatDateDisplay(selectedTeacherReport.submittedAt) }}
              </p>
            </VCol>
          </VRow>

          <VDivider class="mb-6" />

          <!-- Evaluation Responses -->
          <h6 class="text-h6 mb-4">Evaluation Responses</h6>

          <template v-for="(group, groupIndex) in form.question_groups" :key="groupIndex">
            <VCard variant="outlined" class="mb-4">
              <VCardTitle class="pa-4 bg-grey-lighten-4">
                <span class="text-subtitle-1 font-weight-medium">{{ group.title }}</span>
                <VChip size="x-small" class="ms-2" variant="tonal">
                  {{ group.response_style }}
                </VChip>
              </VCardTitle>

              <VDivider />

              <VCardText class="pa-0">
                <VTable density="comfortable">
                  <thead>
                    <tr>
                      <th style="width: 60%">Question</th>
                      <th class="text-center">Rating</th>
                      <th>Interpretation</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="answer in selectedTeacherReport.answers.filter(a => a.groupTitle === group.title)" :key="answer.questionText">
                      <td>{{ answer.questionText }}</td>
                      <td class="text-center">
                        <VChip
                          :color="parseInt(answer.answerValue) >= 4 ? 'success' : parseInt(answer.answerValue) >= 3 ? 'warning' : 'error'"
                          size="small"
                          variant="tonal"
                        >
                          {{ answer.answerValue }}
                        </VChip>
                      </td>
                      <td>
                        <span class="text-body-2">{{ getRatingLabel(answer.answerValue, answer.responseStyle) }}</span>
                      </td>
                    </tr>
                  </tbody>
                </VTable>
              </VCardText>
            </VCard>
          </template>
        </VCardText>
      </VCard>
    </VDialog>

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

<style scoped>
/* Print styles */
@media print {
  .no-print {
    display: none !important;
  }

  .print-content {
    padding: 0 !important;
  }

  .v-card {
    box-shadow: none !important;
    border: 1px solid #ccc !important;
  }

  .v-dialog__content {
    position: static !important;
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
    max-height: none !important;
  }

  .v-overlay__content {
    position: static !important;
    width: 100% !important;
    max-width: 100% !important;
  }
}
</style>
