<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'StudentSurveys',
  },
})

// ==================== INTERFACES ====================

interface StudentQuestion {
  id: number
  question: string
  sort?: number
}

interface StudentQuestionGroup {
  id: number
  number: number
  title: string
  response_style: string
  question_id?: StudentQuestion[]
}

interface StudentSurvey {
  id: number
  title: string
  description: string
  instruction?: string
  is_active: string
  classes?: any[]
  answer_id?: StudentQuestionGroup[]
}

interface Teacher {
  id: number
  first_name: string
  last_name: string
}

interface ClassInfo {
  id: number
  section: string
  course_id?: { id: number; courseCode: string; courseName: string } | null
  teacher_id?: Teacher | number | null
}

interface PendingEvaluation {
  survey: StudentSurvey
  classInfo: ClassInfo
  teacher?: Teacher
  isCompleted: boolean
}

interface CompletedResponse {
  id: number
  survey_id: number
  surveyTitle: string
  classId?: number
  className?: string
  teacherName?: string
  submitted_at: string
}

// ==================== STATE ====================

const isLoading = ref(true)
const activeTab = ref('pending')
const pendingEvaluations = ref<PendingEvaluation[]>([])
const completedResponses = ref<CompletedResponse[]>([])
const studentClasses = ref<ClassInfo[]>([])

// Error/info state
const hasError = ref(false)
const errorMessage = ref('')

// Snackbar
const snackbar = ref({
  show: false,
  message: '',
  color: 'success',
})

// ==================== COMPUTED ====================

const pendingCount = computed(() => pendingEvaluations.value.filter(e => !e.isCompleted).length)
const completedCount = computed(() => completedResponses.value.length)

// ==================== FETCH FUNCTIONS ====================

const fetchData = async () => {
  isLoading.value = true
  hasError.value = false
  errorMessage.value = ''

  try {
    // Get student ID from cookie
    const userData = useCookie('userData').value as any
    const sid = userData?.student_id

    if (!sid) {
      hasError.value = true
      errorMessage.value = 'Student ID not found. Please log out and log in again. Make sure your email matches a student record in the system.'
      isLoading.value = false
      return
    }

    await fetchStudentClasses()
    await Promise.all([
      fetchPendingEvaluations(),
      fetchCompletedResponses(),
    ])
  }
  catch (error) {
    console.error('Failed to fetch data:', error)
    hasError.value = true
    errorMessage.value = 'Failed to load evaluation data. Please try again.'
  }
  finally {
    isLoading.value = false
  }
}

// Fetch classes the student is enrolled in
const fetchStudentClasses = async () => {
  try {
    const userData = useCookie('userData').value as any
    const sid = userData?.student_id

    if (!sid) {
      studentClasses.value = []
      return
    }

    // student_id is a junction table (M2M): classes -> classes_students -> students
    const res = await $api('/items/classes', {
      params: {
        filter: {
          student_id: {
            students_id: { _eq: sid },
          },
        },
        fields: ['id', 'section', 'course_id.*', 'teacher_id.*'],
      },
    })

    studentClasses.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch student classes:', error)
    studentClasses.value = []
  }
}

// Fetch pending evaluations
const fetchPendingEvaluations = async () => {
  try {
    const userData = useCookie('userData').value as any
    const sid = userData?.student_id

    if (!sid) {
      pendingEvaluations.value = []
      return
    }

    // Fetch all active surveys with their assigned classes
    // classes is a junction table: { id, StudentSatisfactionSurvey_id, classes_id: { class data } }
    const res = await $api('/items/StudentSatisfactionSurvey', {
      params: {
        filter: { is_active: { _eq: 'Active' } },
        fields: [
          '*',
          // Junction table format for classes
          'classes.id',
          'classes.classes_id.id',
          'classes.classes_id.section',
          'classes.classes_id.teacher_id.id',
          'classes.classes_id.teacher_id.first_name',
          'classes.classes_id.teacher_id.last_name',
          'classes.classes_id.course_id.id',
          'classes.classes_id.course_id.courseCode',
          'classes.classes_id.course_id.courseName',
          // Question groups
          'answer_id.*',
          'answer_id.question_id.*',
        ],
      },
    })

    const allSurveys: StudentSurvey[] = res.data || []

    // Get completed responses for this student (survey_id + class_id combinations)
    interface CompletedEvaluation {
      surveyId: number
      classId: number | null
    }
    let completedEvaluations: CompletedEvaluation[] = []
    try {
      const completedRes = await $api('/items/StudentSurveyResponse', {
        params: {
          filter: { student_id: { _eq: sid } },
          fields: ['survey_id', 'class_id'],
        },
      })
      completedEvaluations = (completedRes.data || []).map((r: any) => ({
        surveyId: typeof r.survey_id === 'object' ? r.survey_id?.id : r.survey_id,
        classId: typeof r.class_id === 'object' ? r.class_id?.id : r.class_id,
      }))
    }
    catch (err) {
      console.error('Failed to fetch completed responses:', err)
    }

    // Build pending evaluations - one entry per survey + class combination
    const evaluations: PendingEvaluation[] = []

    for (const survey of allSurveys) {
      // Get classes assigned to this survey
      // Junction table format: { id, StudentSatisfactionSurvey_id, classes_id: { id, section, teacher_id, course_id } }
      const surveyClasses = survey.classes || []

      // Extract class data from junction table
      const surveyClassData = surveyClasses.map((junctionEntry: any) => {
        const classData = junctionEntry?.classes_id
        if (!classData) return null

        if (typeof classData === 'object') {
          return {
            id: classData.id,
            section: classData.section,
            teacher_id: classData.teacher_id,
            course_id: classData.course_id,
          }
        }
        return { id: classData }
      }).filter((c: any) => c !== null)

      const surveyClassIds = surveyClassData.map((c: any) => c.id)

      // Find intersection of survey classes and student's classes
      const matchingStudentClasses = studentClasses.value.filter(sc => surveyClassIds.includes(sc.id))

      for (const studentClass of matchingStudentClasses) {
        // Check if this survey + class combination is already completed
        const isCompleted = completedEvaluations.some(
          c => c.surveyId === survey.id && c.classId === studentClass.id,
        )

        if (!isCompleted) {
          // Get teacher info - prefer from studentClasses (already fetched with full data)
          let teacher: Teacher | undefined
          if (typeof studentClass.teacher_id === 'object' && studentClass.teacher_id) {
            teacher = studentClass.teacher_id as Teacher
          }

          // Fallback: try to get teacher from survey junction data
          if (!teacher) {
            const surveyClassEntry = surveyClassData.find((c: any) => c.id === studentClass.id)
            if (surveyClassEntry?.teacher_id && typeof surveyClassEntry.teacher_id === 'object') {
              teacher = surveyClassEntry.teacher_id as Teacher
            }
          }

          evaluations.push({
            survey,
            classInfo: studentClass,
            teacher,
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
    const studentId = userData?.student_id

    if (!studentId) {
      completedResponses.value = []
      return
    }

    const res = await $api('/items/StudentSurveyResponse', {
      params: {
        filter: { student_id: { _eq: studentId } },
        fields: [
          'id',
          'survey_id.id',
          'survey_id.title',
          'class_id.id',
          'class_id.section',
          'class_id.course_id.courseCode',
          'class_id.teacher_id.first_name',
          'class_id.teacher_id.last_name',
          'submitted_at',
        ],
        sort: ['-submitted_at'],
      },
    })

    completedResponses.value = (res.data || []).map((r: any) => {
      const classData = r.class_id
      const teacher = classData?.teacher_id

      return {
        id: r.id,
        survey_id: typeof r.survey_id === 'object' ? r.survey_id.id : r.survey_id,
        surveyTitle: typeof r.survey_id === 'object' ? r.survey_id.title : `Survey #${r.survey_id}`,
        classId: classData?.id,
        className: classData ? `${classData.course_id?.courseCode || ''} - ${classData.section}` : undefined,
        teacherName: teacher ? `${teacher.first_name} ${teacher.last_name}` : undefined,
        submitted_at: r.submitted_at,
      }
    })
  }
  catch (error) {
    console.error('Failed to fetch completed responses:', error)
    completedResponses.value = []
  }
}

// ==================== NAVIGATION ====================

const router = useRouter()

const openSurvey = (evaluation: PendingEvaluation) => {
  router.push(`/student/surveys-${evaluation.survey.id}?class=${evaluation.classInfo.id}`)
}

// ==================== HELPERS ====================

const getTeacherName = (teacher?: Teacher): string => {
  if (!teacher) return '-'
  return `${teacher.first_name} ${teacher.last_name}`
}

const getClassName = (classInfo: ClassInfo): string => {
  const courseCode = typeof classInfo.course_id === 'object' && classInfo.course_id
    ? classInfo.course_id.courseCode
    : ''
  return `${courseCode} - ${classInfo.section}`
}

const getQuestionCount = (survey: StudentSurvey): number => {
  return (survey.answer_id || []).reduce((acc, g) => acc + (g.question_id?.length || 0), 0)
}

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
          Evaluate your class instructors and view your submission history
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

    <!-- Loading State -->
    <VCard v-if="isLoading">
      <VCardText class="d-flex justify-center align-center pa-12">
        <VProgressCircular indeterminate color="primary" />
        <span class="ms-4">Loading evaluations...</span>
      </VCardText>
    </VCard>

    <!-- Error Alert -->
    <VAlert
      v-else-if="hasError"
      type="warning"
      variant="tonal"
      class="mb-6"
    >
      <template #title>Unable to Load Evaluations</template>
      {{ errorMessage }}
    </VAlert>

    <template v-else>
      <!-- Info alert when no classes assigned -->
      <VAlert
        v-if="studentClasses.length === 0"
        type="info"
        variant="tonal"
        class="mb-4"
      >
        <template #title>No Classes Found</template>
        You are not currently enrolled in any classes. Please contact your administrator if you believe this is an error.
      </VAlert>

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
                    <th>Survey</th>
                    <th>Class</th>
                    <th>Instructor</th>
                    <th>Questions</th>
                    <th class="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="evaluation in pendingEvaluations.filter(e => !e.isCompleted)"
                    :key="`${evaluation.survey.id}-${evaluation.classInfo.id}`"
                  >
                    <td>{{ evaluation.survey.title }}</td>
                    <td>{{ getClassName(evaluation.classInfo) }}</td>
                    <td>{{ getTeacherName(evaluation.teacher) }}</td>
                    <td>{{ getQuestionCount(evaluation.survey) }}</td>
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

            <VTable v-else>
              <thead>
                <tr>
                  <th>Survey</th>
                  <th>Class</th>
                  <th>Instructor</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="response in completedResponses" :key="response.id">
                  <td>
                    <div class="d-flex align-center gap-2">
                      <VAvatar size="32" color="success" variant="tonal">
                        <VIcon icon="ri-check-line" size="16" />
                      </VAvatar>
                      <span class="font-weight-medium">{{ response.surveyTitle }}</span>
                    </div>
                  </td>
                  <td>{{ response.className || '-' }}</td>
                  <td>{{ response.teacherName || '-' }}</td>
                  <td>{{ formatDate(response.submitted_at) }}</td>
                </tr>
              </tbody>
            </VTable>
          </VWindowItem>
        </VWindow>
      </VCard>
    </template>

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
