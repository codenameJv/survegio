<script setup lang="ts">
import { $api } from '@/utils/api'
import Papa from 'papaparse'

definePage({
  meta: {
    action: 'read',
    subject: 'classes',
  },
})

interface AcademicTerm {
  id: number
  schoolYear: string
  semester: string
  status: string
}

interface Course {
  id: number
  courseCode: string
  courseName: string
}

interface ClassSection {
  id: number
  section: string[]
  program_id: { id: number; programCode: string } | number | null
}

interface Department {
  id: number
  name: { id: number; programName: string; programCode: string } | number | null
}

interface Teacher {
  id: number
  first_name: string
  middle_name: string
  last_name: string
  position: string
}

interface ClassItem {
  id?: number
  acadTerm_id: number | AcademicTerm | null
  course_id: number | Course | null
  section: string
  student_id?: number[]
  department_id: number[]
  teacher_id?: number | Teacher | null
}

interface ImportedStudent {
  studentNo: string
  lastName: string
  firstName: string
  middleInitial: string
  gender: string
  email: string
  programSection: string
}

interface ParsedClassData {
  semester: string
  schoolYear: string
  courseCode: string
  courseName: string
  section: string
  students: ImportedStudent[]
}

// State
const classes = ref<ClassItem[]>([])
const academicTerms = ref<AcademicTerm[]>([])
const courses = ref<Course[]>([])
const classSections = ref<ClassSection[]>([])
const departments = ref<Department[]>([])
const teachers = ref<Teacher[]>([])
const isLoading = ref(false)
const isDialogOpen = ref(false)
const isDeleteDialogOpen = ref(false)
const isEditing = ref(false)
const selectedClass = ref<ClassItem | null>(null)

const form = ref({
  id: undefined as number | undefined,
  acadTerm_id: null as number | null,
  course_id: null as number | null,
  section: '',
  department_id: null as number | null,
  teacher_id: null as number | null,
})

const search = ref('')
const departmentFilter = ref<number | null>(null)

// Router
const router = useRouter()

// Import state
const isImportDialogOpen = ref(false)
const importFile = ref<File | null>(null)
const parsedImportData = ref<ParsedClassData | null>(null)
const isParsingFile = ref(false)
const isImporting = ref(false)
const importError = ref('')
const importStep = ref<'upload' | 'preview' | 'result'>('upload')
const importResult = ref<{ success: boolean; message: string; details?: string[] }>({ success: false, message: '' })
const selectedAcadTermForImport = ref<number | null>(null)
const selectedDepartmentForImport = ref<number | null>(null)
const selectedTeacherForImport = ref<number | null>(null)

// Table headers
const headers = [
  { title: 'Section', key: 'section', sortable: true },
  { title: 'Course', key: 'course', sortable: true },
  { title: 'Teacher', key: 'teacher', sortable: true },
  { title: 'Department', key: 'department', sortable: false },
  { title: 'Academic Term', key: 'acadTerm', sortable: true },
  { title: 'Students', key: 'studentCount', sortable: true, align: 'center' as const },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' as const },
]

// Get academic term display
const getAcademicTerm = (classItem: ClassItem): string => {
  if (typeof classItem.acadTerm_id === 'object' && classItem.acadTerm_id !== null)
    return `${classItem.acadTerm_id.schoolYear} - ${classItem.acadTerm_id.semester}`

  const term = academicTerms.value.find(t => t.id === classItem.acadTerm_id)
  return term ? `${term.schoolYear} - ${term.semester}` : '-'
}

// Get academic term status
const getAcademicTermStatus = (classItem: ClassItem): string => {
  if (typeof classItem.acadTerm_id === 'object' && classItem.acadTerm_id !== null)
    return classItem.acadTerm_id.status

  const term = academicTerms.value.find(t => t.id === classItem.acadTerm_id)
  return term?.status || ''
}

// Get course display
const getCourse = (classItem: ClassItem): string => {
  if (typeof classItem.course_id === 'object' && classItem.course_id !== null)
    return classItem.course_id.courseCode

  const course = courses.value.find(c => c.id === classItem.course_id)
  return course?.courseCode || '-'
}

// Get course full name for tooltip
const getCourseName = (classItem: ClassItem): string => {
  if (typeof classItem.course_id === 'object' && classItem.course_id !== null)
    return classItem.course_id.courseName

  const course = courses.value.find(c => c.id === classItem.course_id)
  return course?.courseName || ''
}

// Get department display
const getDepartment = (classItem: ClassItem): string => {
  if (!classItem.department_id || !Array.isArray(classItem.department_id) || classItem.department_id.length === 0)
    return ''

  const item = classItem.department_id[0]
  let deptId: number | null = null

  // Handle different Directus relationship structures
  if (typeof item === 'number') {
    deptId = item
  }
  else if (typeof item === 'object' && item !== null) {
    deptId = (item as any).Department_id || (item as any).id || null
  }

  if (deptId) {
    const dept = departments.value.find(d => d.id === deptId)
    if (dept && typeof dept.name === 'object' && dept.name !== null)
      return dept.name.programCode
  }

  return ''
}

// Get student count - handles junction table structure
const getStudentCount = (classItem: ClassItem): number => {
  if (!classItem.student_id || !Array.isArray(classItem.student_id))
    return 0

  // Count valid student entries from junction table
  return classItem.student_id.filter((item: any) => {
    if (typeof item === 'number')
      return true
    if (typeof item === 'object' && item !== null)
      return item.students_id || item.id
    return false
  }).length
}

// Get selected department title for display
const selectedDepartmentTitle = computed(() => {
  if (!form.value.department_id) return ''
  const dept = departmentOptions.value.find(d => d.id === form.value.department_id)
  return dept?.title || ''
})

// Computed for department selection with proper object binding
const selectedDepartment = computed({
  get: () => {
    if (!form.value.department_id) return null
    return departmentOptions.value.find(d => d.id === form.value.department_id) || null
  },
  set: (val) => {
    form.value.department_id = val?.id || null
  },
})

// Get available sections based on selected department
const availableSections = computed(() => {
  const sections: string[] = []

  // Get program code from selected department
  const selectedProgramCode = selectedDepartmentTitle.value

  for (const cs of classSections.value) {
    if (cs.section && Array.isArray(cs.section)) {
      let programCode = ''
      if (typeof cs.program_id === 'object' && cs.program_id !== null)
        programCode = cs.program_id.programCode

      // If department is selected, only show sections for that program
      if (selectedProgramCode && programCode !== selectedProgramCode)
        continue

      for (const sec of cs.section) {
        const fullSection = programCode ? `${programCode}${sec}` : sec
        if (!sections.includes(fullSection))
          sections.push(fullSection)
      }
    }
  }
  return sections.sort()
})

// Get academic terms for dropdown
const academicTermOptions = computed(() => {
  return academicTerms.value.map(term => ({
    id: term.id,
    title: `${term.schoolYear} - ${term.semester}`,
    status: term.status,
  }))
})

// Get departments formatted for dropdown
const departmentOptions = computed(() => {
  return departments.value.map(dept => ({
    id: dept.id,
    title: typeof dept.name === 'object' && dept.name !== null ? dept.name.programCode : '-',
    subtitle: typeof dept.name === 'object' && dept.name !== null ? dept.name.programName : '',
  }))
})

// Get department ID from class item for filtering
const getClassDepartmentId = (classItem: ClassItem): number | null => {
  if (!classItem.department_id || !Array.isArray(classItem.department_id) || classItem.department_id.length === 0)
    return null

  const item = classItem.department_id[0]

  if (typeof item === 'number')
    return item
  if (typeof item === 'object' && item !== null)
    return (item as any).Department_id || (item as any).id || null

  return null
}

// Filtered classes by department
const filteredClasses = computed(() => {
  if (!departmentFilter.value)
    return classes.value

  return classes.value.filter(classItem => getClassDepartmentId(classItem) === departmentFilter.value)
})

// Watch for department changes to reset section
watch(() => form.value.department_id, () => {
  // Clear section when department changes (only if not editing)
  if (!isEditing.value)
    form.value.section = ''
})

// Get courses formatted for dropdown
const courseOptions = computed(() => {
  return courses.value.map(course => ({
    id: course.id,
    title: course.courseCode,
    subtitle: course.courseName,
  }))
})

// Get teachers formatted for dropdown
const teacherOptions = computed(() => {
  return teachers.value.map(teacher => ({
    id: teacher.id,
    title: `${teacher.last_name}, ${teacher.first_name}${teacher.middle_name ? ` ${teacher.middle_name.charAt(0)}.` : ''}`,
    subtitle: teacher.position || '',
  }))
})

// Get teacher display name
const getTeacher = (classItem: ClassItem): string => {
  if (!classItem.teacher_id)
    return '-'
  if (typeof classItem.teacher_id === 'object' && classItem.teacher_id !== null) {
    const t = classItem.teacher_id
    return `${t.last_name}, ${t.first_name}${t.middle_name ? ` ${t.middle_name.charAt(0)}.` : ''}`
  }
  const teacher = teachers.value.find(t => t.id === classItem.teacher_id)
  if (teacher)
    return `${teacher.last_name}, ${teacher.first_name}${teacher.middle_name ? ` ${teacher.middle_name.charAt(0)}.` : ''}`
  return '-'
}

// Fetch classes from Directus
const fetchClasses = async () => {
  isLoading.value = true
  try {
    const res = await $api('/items/classes', {
      params: {
        fields: ['*', 'acadTerm_id.*', 'course_id.*', 'department_id.*', 'student_id.*', 'teacher_id.*'],
      },
    })

    classes.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch classes:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Fetch academic terms
const fetchAcademicTerms = async () => {
  try {
    const res = await $api('/items/academicTerms', {
      params: {
        fields: ['id', 'schoolYear', 'semester', 'status'],
        sort: '-schoolYear',
      },
    })

    academicTerms.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch academic terms:', error)
  }
}

// Fetch courses
const fetchCourses = async () => {
  try {
    const res = await $api('/items/courses', {
      params: {
        fields: ['id', 'courseCode', 'courseName'],
        sort: 'courseCode',
      },
    })

    courses.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch courses:', error)
  }
}

// Fetch class sections
const fetchClassSections = async () => {
  try {
    const res = await $api('/items/ClassSection', {
      params: {
        fields: ['id', 'section', 'program_id.id', 'program_id.programCode'],
      },
    })

    classSections.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch class sections:', error)
  }
}

// Fetch departments
const fetchDepartments = async () => {
  try {
    const res = await $api('/items/Department', {
      params: {
        fields: ['id', 'name.id', 'name.programName', 'name.programCode'],
      },
    })

    departments.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch departments:', error)
  }
}

// Fetch teachers
const fetchTeachers = async () => {
  try {
    const res = await $api('/items/Teachers', {
      params: {
        fields: ['id', 'first_name', 'middle_name', 'last_name', 'position'],
        sort: 'last_name',
      },
    })

    teachers.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch teachers:', error)
  }
}

// Open dialog for creating new class
const openCreateDialog = () => {
  isEditing.value = false
  form.value = {
    id: undefined,
    acadTerm_id: null,
    course_id: null,
    section: '',
    department_id: null,
    teacher_id: null,
  }
  isDialogOpen.value = true
}

// Get department option by ID
const getDepartmentOption = (deptId: number) => {
  return departmentOptions.value.find(d => d.id === deptId) || null
}

// Open dialog for editing class
const openEditDialog = (classItem: ClassItem) => {
  isEditing.value = true

  // Extract IDs from relationships
  const acadTermId = typeof classItem.acadTerm_id === 'object' && classItem.acadTerm_id !== null
    ? classItem.acadTerm_id.id
    : classItem.acadTerm_id

  const courseId = typeof classItem.course_id === 'object' && classItem.course_id !== null
    ? classItem.course_id.id
    : classItem.course_id

  const teacherId = typeof classItem.teacher_id === 'object' && classItem.teacher_id !== null
    ? classItem.teacher_id.id
    : classItem.teacher_id

  // Get first department ID from junction table (Department_id with capital D)
  let deptId: number | null = null
  if (classItem.department_id && classItem.department_id.length > 0) {
    const firstDept = classItem.department_id[0]
    if (typeof firstDept === 'object' && firstDept !== null) {
      // Junction table structure: { id, classes_id, Department_id }
      deptId = (firstDept as any).Department_id || (firstDept as any).id || null
    }
    else {
      deptId = firstDept as number
    }
  }

  form.value = {
    id: classItem.id,
    acadTerm_id: acadTermId,
    course_id: courseId,
    section: classItem.section,
    department_id: deptId,
    teacher_id: teacherId ?? null,
  }

  isDialogOpen.value = true
}

// Open delete confirmation dialog
const openDeleteDialog = (classItem: ClassItem) => {
  selectedClass.value = classItem
  isDeleteDialogOpen.value = true
}

// Save class (create or update)
const saveClass = async () => {
  try {
    const body: any = {
      acadTerm_id: form.value.acadTerm_id,
      course_id: form.value.course_id,
      section: form.value.section,
      teacher_id: form.value.teacher_id,
    }

    // Handle department_id M2M - Directus expects junction table structure
    if (form.value.department_id) {
      body.department_id = [{ Department_id: form.value.department_id }]
    }
    else {
      body.department_id = []
    }

    if (isEditing.value && form.value.id) {
      await $api(`/items/classes/${form.value.id}`, {
        method: 'PATCH',
        body,
      })
    }
    else {
      await $api('/items/classes', {
        method: 'POST',
        body,
      })
    }

    isDialogOpen.value = false
    await fetchClasses()
  }
  catch (error) {
    console.error('Failed to save class:', error)
  }
}

// Delete class and associated students
const deleteClass = async () => {
  if (!selectedClass.value?.id)
    return

  try {
    // First, fetch the class with student IDs
    const classRes = await $api(`/items/classes/${selectedClass.value.id}`, {
      params: {
        fields: ['student_id.students_id'],
      },
    })

    // Extract student IDs from junction table
    const studentIds: number[] = (classRes.data?.student_id || [])
      .map((item: any) => item.students_id?.id || item.students_id || item.id)
      .filter((id: any) => typeof id === 'number')

    // Delete all students associated with this class
    if (studentIds.length > 0) {
      for (const studentId of studentIds) {
        try {
          await $api(`/items/students/${studentId}`, {
            method: 'DELETE',
          })
        }
        catch (err) {
          console.error(`Failed to delete student ${studentId}:`, err)
        }
      }
    }

    // Delete the class
    await $api(`/items/classes/${selectedClass.value.id}`, {
      method: 'DELETE',
    })

    isDeleteDialogOpen.value = false
    selectedClass.value = null
    await fetchClasses()
  }
  catch (error) {
    console.error('Failed to delete class:', error)
  }
}

// Navigate to class detail page
const viewClassDetails = (classItem: ClassItem) => {
  if (classItem.id)
    router.push(`/classes/${classItem.id}`)
}

// === IMPORT FUNCTIONS ===

// Open import dialog
const openImportDialog = () => {
  importFile.value = null
  parsedImportData.value = null
  importError.value = ''
  importStep.value = 'upload'
  importResult.value = { success: false, message: '' }
  selectedAcadTermForImport.value = null
  selectedDepartmentForImport.value = null
  selectedTeacherForImport.value = null
  isImportDialogOpen.value = true
}

// Handle file selection
const handleFileSelect = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    importFile.value = input.files[0]
    importError.value = ''
  }
}

// Parse the CSV file
const parseImportFile = () => {
  if (!importFile.value) {
    importError.value = 'Please select a file first'
    return
  }

  isParsingFile.value = true
  importError.value = ''

  Papa.parse(importFile.value, {
    complete: (results: Papa.ParseResult<string[]>) => {
      try {
        const parsed = extractClassData(results.data)
        parsedImportData.value = parsed
        importStep.value = 'preview'
      }
      catch (err: any) {
        importError.value = err.message || 'Failed to parse file'
      }
      finally {
        isParsingFile.value = false
      }
    },
    error: (error: Error) => {
      importError.value = error.message || 'Failed to read file'
      isParsingFile.value = false
    },
  })
}

// Extract class data from parsed CSV rows
const extractClassData = (rows: string[][]): ParsedClassData => {
  const data: ParsedClassData = {
    semester: '',
    schoolYear: '',
    courseCode: '',
    courseName: '',
    section: '',
    students: [],
  }

  let studentStartIndex = -1

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0)
      continue

    const firstCell = (row[0] || '').trim()
    const secondCell = (row[1] || '').trim()

    // Look for semester line (e.g., "FIRST SEMESTER 2025-2026")
    if (firstCell.match(/^(FIRST|SECOND|THIRD|SUMMER)\s+SEMESTER\s+\d{4}-\d{4}$/i)) {
      const semesterMatch = firstCell.match(/^(FIRST|SECOND|THIRD|SUMMER)\s+SEMESTER\s+(\d{4}-\d{4})$/i)
      if (semesterMatch) {
        data.semester = semesterMatch[1].charAt(0).toUpperCase() + semesterMatch[1].slice(1).toLowerCase() + ' Semester'
        data.schoolYear = semesterMatch[2]
      }
    }

    // Look for course code line (e.g., ",CS101 - Introduction to Computing")
    if (secondCell.match(/^[A-Z]{2,4}\d{2,4}\s*-/i)) {
      const courseMatch = secondCell.match(/^([A-Z]{2,4}\d{2,4})\s*-\s*(.+)$/i)
      if (courseMatch) {
        data.courseCode = courseMatch[1].trim()
        data.courseName = courseMatch[2].trim()
      }
    }

    // Look for section line (e.g., ",BSCS-2A")
    if (secondCell.match(/^[A-Z]{2,6}-?\d?[A-Z]$/i) && !data.section) {
      data.section = secondCell.trim()
    }

    // Look for student data header row
    if (firstCell.match(/^No\.?$/i) && (secondCell.match(/student/i) || (row[2] || '').trim().match(/last/i))) {
      studentStartIndex = i + 1
      continue
    }

    // Parse student rows (after header)
    if (studentStartIndex > 0 && i >= studentStartIndex) {
      const rowNum = firstCell
      const studentNo = secondCell
      const lastName = (row[2] || '').trim()
      const firstName = (row[3] || '').trim()
      const middleInitial = (row[4] || '').trim()

      // Handle both old format (6 cols) and new format (8 cols with gender, email)
      let gender = ''
      let email = ''
      let programSection = ''

      // Check if column 6 looks like an email (contains @) to detect new format
      const col6 = (row[6] || '').trim()
      const col5 = (row[5] || '').trim()
      const col7 = (row[7] || '').trim()

      if (col6.includes('@') || (col5 && col7)) {
        // New format: No, StudentNo, LastName, FirstName, MI, Gender, Email, Section
        gender = col5
        email = col6
        programSection = col7
      }
      else {
        // Old format: No, StudentNo, LastName, FirstName, MI, Section
        programSection = col5
      }

      // Validate this is a student row (has a number and student number pattern)
      // More flexible regex: allows various student number formats (letters, numbers, dashes)
      if (rowNum.match(/^\d+$/) && studentNo.match(/^[A-Za-z0-9]+-?[A-Za-z0-9]+$/)) {
        data.students.push({
          studentNo,
          lastName,
          firstName,
          middleInitial,
          gender,
          email,
          programSection,
        })
      }
    }
  }

  if (!data.courseCode)
    throw new Error('Could not find course information in the file')
  if (!data.section)
    throw new Error('Could not find section information in the file')
  if (data.students.length === 0)
    throw new Error('No student data found in the file')

  return data
}

// Extract program code from section (e.g., "BSCS 2A" -> "BSCS")
const extractProgramCode = (section: string): string => {
  const match = section.match(/^([A-Z]{2,6})/i)
  return match ? match[1].toUpperCase() : ''
}

// Find matching department by program code
const findDepartmentByProgramCode = (programCode: string): number | null => {
  const dept = departments.value.find(d => {
    if (typeof d.name === 'object' && d.name !== null)
      return d.name.programCode?.toUpperCase() === programCode.toUpperCase()
    return false
  })
  return dept?.id || null
}

// Find or create course
const findOrCreateCourse = async (courseCode: string, courseName: string): Promise<number> => {
  // First try to find existing course
  const existingCourse = courses.value.find(c =>
    c.courseCode.toUpperCase() === courseCode.toUpperCase(),
  )

  if (existingCourse)
    return existingCourse.id

  // Create new course
  const res = await $api('/items/courses', {
    method: 'POST',
    body: {
      courseCode,
      courseName,
    },
  })

  // Refresh courses list
  await fetchCourses()

  return res.data.id
}

// Find academic term by semester and school year
const findAcademicTerm = (semester: string, schoolYear: string): number | null => {
  const term = academicTerms.value.find(t =>
    t.semester.toLowerCase().includes(semester.toLowerCase().replace(' semester', ''))
    && t.schoolYear === schoolYear,
  )
  return term?.id || null
}

// Create or find student
const findOrCreateStudent = async (studentData: ImportedStudent, departmentId: number | null): Promise<number> => {
  // Try to find existing student by student number
  try {
    const existingRes = await $api('/items/students', {
      params: {
        filter: {
          student_number: { _eq: studentData.studentNo },
        },
        fields: ['id'],
      },
    })

    if (existingRes.data && existingRes.data.length > 0)
      return existingRes.data[0].id
  }
  catch (error) {
    console.error('Error checking existing student:', error)
  }

  // Create new student
  const studentBody: any = {
    student_number: studentData.studentNo,
    first_name: studentData.firstName,
    middle_name: studentData.middleInitial || '',
    last_name: studentData.lastName,
    email: studentData.email || `${studentData.studentNo}@student.edu`, // Use imported email or generate default
    gender: studentData.gender || '', // Use imported gender
    birthdate: '', // Unknown from CSV
    is_active: 'Active',
  }

  if (departmentId)
    studentBody.deparment_id = departmentId

  const res = await $api('/items/students', {
    method: 'POST',
    body: studentBody,
  })

  return res.data.id
}

// Execute the import
const executeImport = async () => {
  if (!parsedImportData.value || !selectedAcadTermForImport.value || !selectedDepartmentForImport.value) {
    importError.value = 'Please select academic term and department'
    return
  }

  isImporting.value = true
  importError.value = ''
  const details: string[] = []

  try {
    const data = parsedImportData.value

    // Step 1: Find or create course
    details.push(`Finding/creating course: ${data.courseCode}`)
    const courseId = await findOrCreateCourse(data.courseCode, data.courseName)
    details.push(`Course ready (ID: ${courseId})`)

    // Step 1.5: Use selected teacher
    const teacherId = selectedTeacherForImport.value
    if (teacherId) {
      const teacher = teacherOptions.value.find(t => t.id === teacherId)
      details.push(`Teacher selected: ${teacher?.title || teacherId}`)
    }
    else {
      details.push(`No teacher selected for this class`)
    }

    // Step 2: Create students
    const studentIds: number[] = []
    details.push(`Processing ${data.students.length} students...`)

    for (const student of data.students) {
      try {
        const studentId = await findOrCreateStudent(student, selectedDepartmentForImport.value)
        studentIds.push(studentId)
        details.push(`Student ${student.studentNo} ready (ID: ${studentId})`)
      }
      catch (err: any) {
        details.push(`Failed to create student ${student.studentNo}: ${err.message}`)
      }
    }

    // Step 3: Check if class already exists
    const existingClassRes = await $api('/items/classes', {
      params: {
        filter: {
          _and: [
            { section: { _eq: data.section } },
            { course_id: { _eq: courseId } },
            { acadTerm_id: { _eq: selectedAcadTermForImport.value } },
          ],
        },
        fields: ['id', 'student_id.*'],
      },
    })

    let classId: number

    if (existingClassRes.data && existingClassRes.data.length > 0) {
      // Class exists - update with new students
      classId = existingClassRes.data[0].id
      details.push(`Found existing class (ID: ${classId}), updating students...`)

      // Get existing student IDs from junction table
      const existingStudentIds: number[] = (existingClassRes.data[0].student_id || [])
        .map((item: any) => item.students_id || item.id || item)
        .filter((id: any) => typeof id === 'number')

      // Merge with new students (avoid duplicates)
      const allStudentIds = [...new Set([...existingStudentIds, ...studentIds])]

      // Update class with all students
      await $api(`/items/classes/${classId}`, {
        method: 'PATCH',
        body: {
          student_id: allStudentIds.map(id => ({ students_id: id })),
        },
      })

      details.push(`Updated class with ${allStudentIds.length} students`)
    }
    else {
      // Create new class
      details.push('Creating new class...')

      const classBody: any = {
        acadTerm_id: selectedAcadTermForImport.value,
        course_id: courseId,
        section: data.section,
        department_id: [{ Department_id: selectedDepartmentForImport.value }],
        student_id: studentIds.map(id => ({ students_id: id })),
        teacher_id: teacherId,
      }

      const classRes = await $api('/items/classes', {
        method: 'POST',
        body: classBody,
      })

      classId = classRes.data.id
      details.push(`Created class (ID: ${classId}) with ${studentIds.length} students`)
    }

    // Update students to associate them with this class
    details.push('Associating students with class...')
    for (const studentId of studentIds) {
      try {
        // Get current class associations
        const studentRes = await $api(`/items/students/${studentId}`, {
          params: { fields: ['class_id.*'] },
        })

        const existingClassIds: number[] = (studentRes.data?.class_id || [])
          .map((item: any) => item.classes_id || item.id || item)
          .filter((id: any) => typeof id === 'number')

        // Add new class if not already associated
        if (!existingClassIds.includes(classId)) {
          const allClassIds = [...existingClassIds, classId]
          await $api(`/items/students/${studentId}`, {
            method: 'PATCH',
            body: {
              class_id: allClassIds.map(id => ({ classes_id: id })),
            },
          })
        }
      }
      catch (err) {
        console.error(`Failed to associate student ${studentId} with class:`, err)
      }
    }

    importResult.value = {
      success: true,
      message: `Successfully imported class "${data.section}" with ${studentIds.length} students`,
      details,
    }
    importStep.value = 'result'

    // Refresh classes list
    await fetchClasses()
  }
  catch (err: any) {
    importResult.value = {
      success: false,
      message: err.message || 'Import failed',
      details,
    }
    importStep.value = 'result'
  }
  finally {
    isImporting.value = false
  }
}

// Reset import to start over
const resetImport = () => {
  importFile.value = null
  parsedImportData.value = null
  importError.value = ''
  importStep.value = 'upload'
  importResult.value = { success: false, message: '' }
  selectedAcadTermForImport.value = null
  selectedDepartmentForImport.value = null
  selectedTeacherForImport.value = null
}

// Fetch data on mount
onMounted(() => {
  fetchClasses()
  fetchAcademicTerms()
  fetchCourses()
  fetchClassSections()
  fetchDepartments()
  fetchTeachers()
})
</script>

<template>
  <div>
    <VCard>
      <VCardTitle class="d-flex align-center pa-6">
        <span class="text-h5">Class List Management</span>
        <VSpacer />
        <VTextField
          v-model="search"
          prepend-inner-icon="ri-search-line"
          placeholder="Search classes..."
          density="compact"
          variant="outlined"
          hide-details
          class="me-4"
          style="max-width: 300px;"
        />
        <VSelect
          v-model="departmentFilter"
          :items="departmentOptions"
          item-title="title"
          item-value="id"
          label="Department"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          class="me-4"
          style="max-width: 180px;"
        />
        <VBtn
          color="secondary"
          variant="outlined"
          prepend-icon="ri-upload-2-line"
          class="me-2"
          @click="openImportDialog"
        >
          Import
        </VBtn>
        <VBtn
          color="primary"
          prepend-icon="ri-add-line"
          @click="openCreateDialog"
        >
          Add Class
        </VBtn>
      </VCardTitle>

      <VDivider />

      <VDataTable
        :headers="headers"
        :items="filteredClasses"
        :search="search"
        :loading="isLoading"
        hover
        class="clickable-rows"
        @click:row="(_event: Event, { item }: { item: ClassItem }) => viewClassDetails(item)"
      >
        <template #item.section="{ item }">
          <span class="font-weight-medium text-primary">{{ item.section }}</span>
        </template>

        <template #item.course="{ item }">
          <VTooltip location="top">
            <template #activator="{ props }">
              <span v-bind="props" class="font-weight-medium text-primary" style="cursor: help;">
                {{ getCourse(item) }}
              </span>
            </template>
            {{ getCourseName(item) }}
          </VTooltip>
        </template>

        <template #item.teacher="{ item }">
          <span v-if="getTeacher(item) !== '-'">{{ getTeacher(item) }}</span>
          <span v-else class="text-medium-emphasis">-</span>
        </template>

        <template #item.department="{ item }">
          <span v-if="getDepartment(item)">{{ getDepartment(item) }}</span>
          <span v-else class="text-medium-emphasis">-</span>
        </template>

        <template #item.acadTerm="{ item }">
          <div class="d-flex align-center gap-2">
            <span>{{ getAcademicTerm(item) }}</span>
            <VChip
              v-if="getAcademicTermStatus(item)"
              :color="getAcademicTermStatus(item) === 'Active' ? 'success' : getAcademicTermStatus(item) === 'Draft' ? 'warning' : 'secondary'"
              size="x-small"
              variant="tonal"
            >
              {{ getAcademicTermStatus(item) }}
            </VChip>
          </div>
        </template>

        <template #item.studentCount="{ item }">
          <span :class="getStudentCount(item) > 0 ? 'font-weight-medium' : 'text-medium-emphasis'">
            {{ getStudentCount(item) }}
          </span>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex justify-center gap-1">
            <IconBtn
              size="small"
              @click.stop="openEditDialog(item)"
            >
              <VIcon icon="ri-pencil-line" />
            </IconBtn>
            <IconBtn
              size="small"
              color="error"
              @click.stop="openDeleteDialog(item)"
            >
              <VIcon icon="ri-delete-bin-line" />
            </IconBtn>
          </div>
        </template>

        <template #no-data>
          <div class="text-center pa-4">
            <p class="text-body-1 text-medium-emphasis">No classes found</p>
          </div>
        </template>
      </VDataTable>
    </VCard>

    <!-- Create/Edit Dialog -->
    <VDialog
      v-model="isDialogOpen"
      max-width="600"
      persistent
    >
      <VCard>
        <VCardTitle class="pa-6">
          {{ isEditing ? 'Edit Class' : 'Add New Class' }}
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VRow>
            <VCol cols="12">
              <VSelect
                v-model="selectedDepartment"
                label="Department"
                :items="departmentOptions"
                item-title="title"
                item-value="id"
                return-object
                variant="outlined"
                placeholder="Select department..."
                hint="Select department first to filter sections"
                persistent-hint
                :rules="[v => !!v || 'Department is required']"
              >
                <template #item="{ item, props }">
                  <VListItem v-bind="props">
                    <template #title>
                      {{ item.raw.title }}
                    </template>
                    <template #subtitle>
                      {{ item.raw.subtitle }}
                    </template>
                  </VListItem>
                </template>
              </VSelect>
            </VCol>
            <VCol cols="12" md="6">
              <VAutocomplete
                v-model="form.section"
                label="Section"
                :items="availableSections"
                variant="outlined"
                placeholder="Type to search sections..."
                :rules="[v => !!v || 'Section is required']"
                :disabled="!form.department_id"
                :hint="!form.department_id ? 'Select a department first' : ''"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="6">
              <VAutocomplete
                v-model="form.acadTerm_id"
                label="Academic Term"
                :items="academicTermOptions"
                item-title="title"
                item-value="id"
                variant="outlined"
                placeholder="Select academic term..."
                :rules="[v => !!v || 'Academic term is required']"
              >
                <template #selection="{ item }">
                  {{ item.raw?.title || '' }}
                </template>
                <template #item="{ item, props }">
                  <VListItem v-bind="props">
                    <template #title>
                      {{ item.raw.title }}
                    </template>
                    <template #append>
                      <VChip
                        :color="item.raw.status === 'Active' ? 'success' : item.raw.status === 'Draft' ? 'warning' : 'secondary'"
                        size="x-small"
                      >
                        {{ item.raw.status }}
                      </VChip>
                    </template>
                  </VListItem>
                </template>
              </VAutocomplete>
            </VCol>
            <VCol cols="12">
              <VAutocomplete
                v-model="form.course_id"
                label="Course"
                :items="courseOptions"
                item-title="title"
                item-value="id"
                variant="outlined"
                placeholder="Type to search courses..."
                :rules="[v => !!v || 'Course is required']"
              >
                <template #selection="{ item }">
                  {{ item.raw?.title || '' }}
                </template>
                <template #item="{ item, props }">
                  <VListItem v-bind="props">
                    <template #title>
                      {{ item.raw.title }}
                    </template>
                    <template #subtitle>
                      {{ item.raw.subtitle }}
                    </template>
                  </VListItem>
                </template>
              </VAutocomplete>
            </VCol>
            <VCol cols="12">
              <VAutocomplete
                v-model="form.teacher_id"
                label="Teacher"
                :items="teacherOptions"
                item-title="title"
                item-value="id"
                variant="outlined"
                placeholder="Select teacher..."
                clearable
              >
                <template #selection="{ item }">
                  {{ item.raw?.title || '' }}
                </template>
                <template #item="{ item, props }">
                  <VListItem v-bind="props">
                    <template #title>
                      {{ item.raw.title }}
                    </template>
                    <template #subtitle>
                      {{ item.raw.subtitle }}
                    </template>
                  </VListItem>
                </template>
              </VAutocomplete>
            </VCol>
          </VRow>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn
            variant="outlined"
            @click="isDialogOpen = false"
          >
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :disabled="!form.department_id || !form.section || !form.acadTerm_id || !form.course_id"
            @click="saveClass"
          >
            {{ isEditing ? 'Update' : 'Create' }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Delete Confirmation Dialog -->
    <VDialog
      v-model="isDeleteDialogOpen"
      max-width="400"
    >
      <VCard>
        <VCardTitle class="pa-6">
          Delete Class
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <p class="mb-3">
            Are you sure you want to delete the class <strong>{{ selectedClass?.section }}</strong>
            <template v-if="selectedClass">
              ({{ getCourse(selectedClass) }})
            </template>?
          </p>
          <VAlert
            v-if="selectedClass"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-0"
          >
            This will also delete all {{ getStudentCount(selectedClass) }} student(s) enrolled in this class. This action cannot be undone.
          </VAlert>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn
            variant="outlined"
            @click="isDeleteDialogOpen = false"
          >
            Cancel
          </VBtn>
          <VBtn
            color="error"
            @click="deleteClass"
          >
            Delete
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Import Dialog -->
    <VDialog
      v-model="isImportDialogOpen"
      max-width="800"
      persistent
    >
      <VCard>
        <VCardTitle class="d-flex align-center pa-6">
          <VIcon icon="ri-upload-2-line" class="me-2" />
          Import Class List
          <VSpacer />
          <VChip
            v-if="importStep === 'upload'"
            color="primary"
            size="small"
          >
            Step 1: Upload
          </VChip>
          <VChip
            v-else-if="importStep === 'preview'"
            color="info"
            size="small"
          >
            Step 2: Preview
          </VChip>
          <VChip
            v-else
            :color="importResult.success ? 'success' : 'error'"
            size="small"
          >
            Step 3: Result
          </VChip>
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <!-- Step 1: Upload -->
          <div v-if="importStep === 'upload'">
            <VAlert
              type="info"
              variant="tonal"
              class="mb-4"
            >
              <div class="text-subtitle-2 mb-2">
                Expected CSV Format:
              </div>
              <div class="text-body-2">
                The CSV should contain: semester info, course code & name, section, and student list with columns: No., Student No., Last Name, First Name, MI, Gender, Email, Program/Section
              </div>
            </VAlert>

            <div class="mb-4">
              <label
                for="import-file"
                class="d-block text-subtitle-2 mb-2"
              >
                Select CSV File
              </label>
              <input
                id="import-file"
                type="file"
                accept=".csv"
                class="file-input"
                @change="handleFileSelect"
              >
            </div>

            <VAlert
              v-if="importFile"
              type="success"
              variant="tonal"
              class="mb-4"
            >
              Selected file: {{ importFile.name }} ({{ Math.round(importFile.size / 1024) }} KB)
            </VAlert>

            <VAlert
              v-if="importError"
              type="error"
              variant="tonal"
              class="mb-4"
            >
              {{ importError }}
            </VAlert>
          </div>

          <!-- Step 2: Preview -->
          <div v-else-if="importStep === 'preview' && parsedImportData">
            <VRow class="mb-4">
              <VCol cols="12" md="6">
                <VCard
                  variant="outlined"
                  class="pa-4"
                >
                  <div class="text-overline text-medium-emphasis mb-1">
                    Course Information
                  </div>
                  <div class="text-h6">
                    {{ parsedImportData.courseCode }}
                  </div>
                  <div class="text-body-2 text-medium-emphasis">
                    {{ parsedImportData.courseName }}
                  </div>
                </VCard>
              </VCol>
              <VCol cols="12" md="6">
                <VCard
                  variant="outlined"
                  class="pa-4"
                >
                  <div class="text-overline text-medium-emphasis mb-1">
                    Section
                  </div>
                  <div class="text-h6">
                    {{ parsedImportData.section }}
                  </div>
                </VCard>
              </VCol>
            </VRow>

            <VRow class="mb-4">
              <VCol cols="12" md="4">
                <VSelect
                  v-model="selectedAcadTermForImport"
                  label="Academic Term *"
                  :items="academicTermOptions"
                  item-title="title"
                  item-value="id"
                  variant="outlined"
                  placeholder="Select academic term..."
                  :hint="parsedImportData.semester && parsedImportData.schoolYear ? `Detected: ${parsedImportData.semester} ${parsedImportData.schoolYear}` : ''"
                  persistent-hint
                >
                  <template #item="{ item, props }">
                    <VListItem v-bind="props">
                      <template #title>
                        {{ item.raw.title }}
                      </template>
                      <template #append>
                        <VChip
                          :color="item.raw.status === 'Active' ? 'success' : item.raw.status === 'Draft' ? 'warning' : 'secondary'"
                          size="x-small"
                        >
                          {{ item.raw.status }}
                        </VChip>
                      </template>
                    </VListItem>
                  </template>
                </VSelect>
              </VCol>
              <VCol cols="12" md="4">
                <VSelect
                  v-model="selectedDepartmentForImport"
                  label="Department *"
                  :items="departmentOptions"
                  item-title="title"
                  item-value="id"
                  variant="outlined"
                  placeholder="Select department..."
                >
                  <template #item="{ item, props }">
                    <VListItem v-bind="props">
                      <template #title>
                        {{ item.raw.title }}
                      </template>
                      <template #subtitle>
                        {{ item.raw.subtitle }}
                      </template>
                    </VListItem>
                  </template>
                </VSelect>
              </VCol>
              <VCol cols="12" md="4">
                <VSelect
                  v-model="selectedTeacherForImport"
                  label="Teacher"
                  :items="teacherOptions"
                  item-title="title"
                  item-value="id"
                  variant="outlined"
                  placeholder="Select teacher..."
                  clearable
                >
                  <template #item="{ item, props }">
                    <VListItem v-bind="props">
                      <template #title>
                        {{ item.raw.title }}
                      </template>
                      <template #subtitle>
                        {{ item.raw.subtitle }}
                      </template>
                    </VListItem>
                  </template>
                </VSelect>
              </VCol>
            </VRow>

            <VCard variant="outlined">
              <VCardTitle class="text-subtitle-1 pa-4 pb-2">
                Students to Import ({{ parsedImportData.students.length }})
              </VCardTitle>
              <VDivider />
              <VTable
                density="compact"
                class="text-no-wrap"
              >
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Student No.</th>
                    <th>Last Name</th>
                    <th>First Name</th>
                    <th>M.I.</th>
                    <th>Gender</th>
                    <th>Email</th>
                    <th>Section</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(student, index) in parsedImportData.students.slice(0, 10)"
                    :key="index"
                  >
                    <td>{{ index + 1 }}</td>
                    <td>{{ student.studentNo }}</td>
                    <td>{{ student.lastName }}</td>
                    <td>{{ student.firstName }}</td>
                    <td>{{ student.middleInitial || '-' }}</td>
                    <td>{{ student.gender || '-' }}</td>
                    <td>{{ student.email || '-' }}</td>
                    <td>{{ student.programSection }}</td>
                  </tr>
                  <tr v-if="parsedImportData.students.length > 10">
                    <td
                      colspan="8"
                      class="text-center text-medium-emphasis"
                    >
                      ... and {{ parsedImportData.students.length - 10 }} more students
                    </td>
                  </tr>
                </tbody>
              </VTable>
            </VCard>

            <VAlert
              v-if="importError"
              type="error"
              variant="tonal"
              class="mt-4"
            >
              {{ importError }}
            </VAlert>
          </div>

          <!-- Step 3: Result -->
          <div v-else-if="importStep === 'result'">
            <VAlert
              :type="importResult.success ? 'success' : 'error'"
              variant="tonal"
              class="mb-4"
            >
              <div class="text-subtitle-1 font-weight-medium mb-1">
                {{ importResult.success ? 'Import Successful!' : 'Import Failed' }}
              </div>
              <div class="text-body-2">
                {{ importResult.message }}
              </div>
            </VAlert>

            <VExpansionPanels
              v-if="importResult.details && importResult.details.length > 0"
              variant="outlined"
            >
              <VExpansionPanel title="Import Details">
                <VExpansionPanelText>
                  <div
                    class="import-log pa-2"
                    style="max-height: 300px; overflow-y: auto; font-family: monospace; font-size: 12px; background: #f5f5f5; border-radius: 4px;"
                  >
                    <div
                      v-for="(detail, index) in importResult.details"
                      :key="index"
                      class="mb-1"
                    >
                      {{ detail }}
                    </div>
                  </div>
                </VExpansionPanelText>
              </VExpansionPanel>
            </VExpansionPanels>
          </div>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VBtn
            v-if="importStep !== 'upload'"
            variant="text"
            @click="resetImport"
          >
            <VIcon icon="ri-arrow-left-line" class="me-1" />
            Start Over
          </VBtn>
          <VSpacer />
          <VBtn
            variant="outlined"
            @click="isImportDialogOpen = false"
          >
            {{ importStep === 'result' ? 'Close' : 'Cancel' }}
          </VBtn>
          <VBtn
            v-if="importStep === 'upload'"
            color="primary"
            :loading="isParsingFile"
            :disabled="!importFile"
            @click="parseImportFile"
          >
            Parse File
          </VBtn>
          <VBtn
            v-if="importStep === 'preview'"
            color="primary"
            :loading="isImporting"
            :disabled="!selectedAcadTermForImport || !selectedDepartmentForImport"
            @click="executeImport"
          >
            Import Class
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>

<style scoped>
.file-input {
  display: block;
  inline-size: 100%;
  padding: 12px;
  border: 2px dashed rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.file-input:hover {
  border-color: rgb(var(--v-theme-primary));
}

.import-log {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.clickable-rows :deep(tbody tr) {
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.clickable-rows :deep(tbody tr:hover) {
  background-color: rgba(var(--v-theme-primary), 0.04) !important;
}
</style>
