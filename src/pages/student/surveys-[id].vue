<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'StudentSurveys',
  },
})

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
  teacher_id?: Teacher | null
}

const route = useRoute()
const router = useRouter()

const surveyId = computed(() => Number(route.params.id))
const classId = computed(() => {
  const id = route.query.class
  return id ? Number(id) : null
})

const isLoading = ref(true)
const isSubmitting = ref(false)
const survey = ref<StudentSurvey | null>(null)
const classInfo = ref<ClassInfo | null>(null)
const answers = ref<Record<number, string>>({})

const snackbar = ref({
  show: false,
  message: '',
  color: 'success',
})

// Get all questions as flat array with response style
const allQuestions = computed(() => {
  if (!survey.value?.answer_id) return []
  const questions: { question: StudentQuestion; groupTitle: string; responseStyle: string }[] = []
  for (const group of survey.value.answer_id) {
    for (const q of group.question_id || []) {
      questions.push({
        question: q,
        groupTitle: group.title,
        responseStyle: group.response_style,
      })
    }
  }
  return questions
})

// Helper to check response style (case-insensitive, partial match)
const isResponseStyle = (responseStyle: string, type: string): boolean => {
  if (!responseStyle) return false
  const lower = responseStyle.toLowerCase()
  return lower.includes(type.toLowerCase())
}

// Get answer options based on response style
const getAnswerOptions = (responseStyle: string) => {
  switch (responseStyle) {
    case 'Likert-Scale Questions':
      return [
        { value: '5', label: 'Strongly Agree' },
        { value: '4', label: 'Agree' },
        { value: '3', label: 'Neutral' },
        { value: '2', label: 'Disagree' },
        { value: '1', label: 'Strongly Disagree' },
      ]
    case 'Rating-Scale Questions':
      return [
        { value: '5', label: 'Excellent (5)' },
        { value: '4', label: 'Very Good (4)' },
        { value: '3', label: 'Good (3)' },
        { value: '2', label: 'Fair (2)' },
        { value: '1', label: 'Poor (1)' },
      ]
    case 'Yes or No':
      return [
        { value: 'Yes', label: 'Yes' },
        { value: 'No', label: 'No' },
      ]
    default:
      return []
  }
}

// Fetch class info
const fetchClassInfo = async () => {
  if (!classId.value) {
    classInfo.value = null
    return
  }
  try {
    const res = await $api(`/items/classes/${classId.value}`, {
      params: {
        fields: ['id', 'section', 'course_id.*', 'teacher_id.*'],
      },
    })
    classInfo.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch class info:', error)
    classInfo.value = null
  }
}

// Fetch survey
const fetchSurvey = async () => {
  isLoading.value = true
  try {
    const [surveyRes] = await Promise.all([
      $api(`/items/StudentSatisfactionSurvey/${surveyId.value}`, {
        params: {
          fields: ['*', 'answer_id.*', 'answer_id.question_id.*'],
        },
      }),
      fetchClassInfo(),
    ])
    survey.value = surveyRes.data
  }
  catch (error) {
    console.error('Failed to fetch survey:', error)
    snackbar.value = { show: true, message: 'Failed to load survey', color: 'error' }
  }
  finally {
    isLoading.value = false
  }
}

// Submit response (two-step approach)
const submitResponse = async () => {
  // Validate all questions are answered
  const unanswered = allQuestions.value.filter(q => !answers.value[q.question.id])
  if (unanswered.length > 0) {
    snackbar.value = { show: true, message: `Please answer all questions (${unanswered.length} remaining)`, color: 'error' }
    return
  }

  isSubmitting.value = true
  try {
    const userData = useCookie('userData').value as any
    const studentId = userData?.student_id

    if (!studentId) {
      snackbar.value = { show: true, message: 'Student ID not found. Please logout and login again.', color: 'error' }
      return
    }

    // Step 1: Create the response first (without nested answers)
    const responseBody: any = {
      survey_id: surveyId.value,
      student_id: studentId,
      submitted_at: new Date().toISOString(),
    }

    // Include class_id if evaluating a specific class
    if (classId.value) {
      responseBody.class_id = classId.value
    }

    // Include evaluated teacher if available from class
    if (classInfo.value?.teacher_id && typeof classInfo.value.teacher_id === 'object') {
      responseBody.evaluated_teacher_id = classInfo.value.teacher_id.id
    }

    const responseRes = await $api('/items/StudentSurveyResponse', {
      method: 'POST',
      body: responseBody,
    })

    const responseId = responseRes.data.id

    // Step 2: Create answers separately with response_id
    const answersData = Object.entries(answers.value).map(([questionId, answerValue]) => ({
      response_id: responseId,
      question_id: Number(questionId),
      answer_value: answerValue,
    }))

    await $api('/items/StudentSurveyAnswer', {
      method: 'POST',
      body: answersData,
    })

    snackbar.value = { show: true, message: 'Evaluation submitted successfully!', color: 'success' }

    // Go back to surveys list after short delay
    setTimeout(() => {
      router.push('/student/surveys')
    }, 1500)
  }
  catch (error: any) {
    console.error('Failed to submit response:', error)
    console.error('Error details:', error?.data)
    let errorMessage = 'Failed to submit evaluation.'
    if (error?.data?.errors?.[0]?.extensions?.code === 'FORBIDDEN') {
      errorMessage = 'Permission denied. Please contact administrator to enable Create permission on StudentSurveyResponse and StudentSurveyAnswer.'
    }
    else if (error?.data?.errors?.[0]?.message) {
      errorMessage = error.data.errors[0].message
    }
    snackbar.value = { show: true, message: errorMessage, color: 'error' }
  }
  finally {
    isSubmitting.value = false
  }
}

const goBack = () => {
  router.push('/student/surveys')
}

// Get teacher name helper
const getTeacherName = (): string => {
  if (!classInfo.value?.teacher_id || typeof classInfo.value.teacher_id !== 'object') return '-'
  return `${classInfo.value.teacher_id.first_name} ${classInfo.value.teacher_id.last_name}`
}

// Get class name helper
const getClassName = (): string => {
  if (!classInfo.value) return '-'
  const courseCode = classInfo.value.course_id?.courseCode || ''
  return `${courseCode} - ${classInfo.value.section}`
}

onMounted(() => {
  fetchSurvey()
})
</script>

<template>
  <div>
    <!-- Loading -->
    <VCard v-if="isLoading">
      <VCardText class="text-center pa-12">
        <VProgressCircular indeterminate color="primary" />
        <p class="mt-4">Loading survey...</p>
      </VCardText>
    </VCard>

    <!-- Survey Form -->
    <template v-else-if="survey">
      <VCard>
        <VCardTitle class="d-flex align-center pa-4">
          <VBtn icon variant="text" @click="goBack">
            <VIcon icon="ri-arrow-left-line" />
          </VBtn>
          <span class="ms-2">{{ survey.title }}</span>
        </VCardTitle>

        <VDivider />

        <VCardText>
          <!-- Class and Teacher being evaluated -->
          <VAlert
            v-if="classInfo"
            type="info"
            variant="tonal"
            class="mb-4"
          >
            <template #title>Evaluating Class Instructor</template>
            <div class="d-flex flex-column gap-1">
              <div>
                <strong>Class:</strong> {{ getClassName() }}
              </div>
              <div>
                <strong>Instructor:</strong> {{ getTeacherName() }}
              </div>
            </div>
          </VAlert>

          <p v-if="survey.description" class="text-body-1 mb-4">{{ survey.description }}</p>
          <p v-if="survey.instruction" class="text-body-2 text-medium-emphasis mb-6">
            <strong>Instructions:</strong> {{ survey.instruction }}
          </p>

          <!-- Questions -->
          <div v-for="(q, index) in allQuestions" :key="q.question.id" class="mb-6">
            <p class="font-weight-medium mb-2">{{ index + 1 }}. {{ q.question.question }}</p>

            <!-- Likert Scale - Radio buttons -->
            <VRadioGroup
              v-if="isResponseStyle(q.responseStyle, 'likert')"
              v-model="answers[q.question.id]"
              inline
            >
              <VRadio
                v-for="option in getAnswerOptions('Likert-Scale Questions')"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </VRadioGroup>

            <!-- Rating Scale - Radio buttons -->
            <VRadioGroup
              v-else-if="isResponseStyle(q.responseStyle, 'rating')"
              v-model="answers[q.question.id]"
              inline
            >
              <VRadio
                v-for="option in getAnswerOptions('Rating-Scale Questions')"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </VRadioGroup>

            <!-- Yes/No - Radio buttons -->
            <VRadioGroup
              v-else-if="isResponseStyle(q.responseStyle, 'yes') || isResponseStyle(q.responseStyle, 'no')"
              v-model="answers[q.question.id]"
              inline
            >
              <VRadio
                v-for="option in getAnswerOptions('Yes or No')"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </VRadioGroup>

            <!-- Multiple Choice - Text field for now -->
            <VTextField
              v-else-if="isResponseStyle(q.responseStyle, 'multiple')"
              v-model="answers[q.question.id]"
              label="Your Answer"
              variant="outlined"
              density="compact"
            />

            <!-- Open-Ended - Textarea -->
            <VTextarea
              v-else-if="isResponseStyle(q.responseStyle, 'open')"
              v-model="answers[q.question.id]"
              label="Your Answer"
              variant="outlined"
              rows="3"
            />

            <!-- Default fallback - Radio 1-5 -->
            <VRadioGroup v-else v-model="answers[q.question.id]" inline>
              <VRadio label="1" value="1" />
              <VRadio label="2" value="2" />
              <VRadio label="3" value="3" />
              <VRadio label="4" value="4" />
              <VRadio label="5" value="5" />
            </VRadioGroup>
          </div>
        </VCardText>

        <VDivider />

        <!-- Warning Alert -->
        <VAlert
          type="warning"
          variant="tonal"
          class="ma-4"
        >
          <template #title>Important Notice</template>
          Once you submit this evaluation, you will not be able to view or modify your answers. Please review your responses carefully before submitting.
        </VAlert>

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="goBack">
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :loading="isSubmitting"
            @click="submitResponse"
          >
            Submit
          </VBtn>
        </VCardActions>
      </VCard>
    </template>

    <!-- Snackbar -->
    <VSnackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="3000"
      location="top"
    >
      {{ snackbar.message }}
    </VSnackbar>
  </div>
</template>
