<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'departments',
  },
})

interface Program {
  id: number
  programCode: string
  programName: string
}

interface Teacher {
  id: number
  first_name: string
  middle_name: string
  last_name: string
  position: string
  email: string
}

interface Department {
  id?: number
  name: number | { id: number; programName: string; programCode: string } | null
  teacher_id: number[] | Teacher[]
  classes_id?: number[] | null
}

interface ClassItem {
  id: number
  department_id: any[]
}

// State
const departments = ref<Department[]>([])
const programs = ref<Program[]>([])
const teachers = ref<Teacher[]>([])
const classes = ref<ClassItem[]>([])
const isLoading = ref(false)
const isDialogOpen = ref(false)
const isDeleteDialogOpen = ref(false)
const isEditing = ref(false)
const selectedDepartment = ref<Department | null>(null)

const form = ref({
  id: undefined as number | undefined,
  name: null as number | null,
  teacher_id: [] as number[],
})

const search = ref('')

// Router
const router = useRouter()

// Table headers
const headers = [
  { title: 'Department Name', key: 'name', sortable: true },
  { title: 'Dean', key: 'dean', sortable: false },
  { title: 'No. of Teachers', key: 'teacherCount', sortable: true, align: 'center' as const },
  { title: 'No. of Classes', key: 'classCount', sortable: true, align: 'center' as const },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' as const },
]

// Get department name from relationship
const getDepartmentName = (department: Department | null) => {
  if (!department)
    return '-'

  if (typeof department.name === 'object' && department.name !== null)
    return department.name.programName || department.name.programCode || '-'

  const program = programs.value.find(p => p.id === department.name)

  return program?.programName || '-'
}

// Get teachers list - handles various Directus response structures
const getTeachers = (department: Department): Teacher[] => {
  if (!department.teacher_id || !Array.isArray(department.teacher_id) || department.teacher_id.length === 0)
    return []

  const teacherList: Teacher[] = []

  for (const item of department.teacher_id) {
    if (typeof item === 'number') {
      // Just an ID, find from teachers list
      const teacher = teachers.value.find(t => t.id === item)
      if (teacher)
        teacherList.push(teacher)
    }
    else if (typeof item === 'object' && item !== null) {
      // Could be direct teacher object or junction table object
      if (item.first_name) {
        // Direct teacher object
        teacherList.push(item as Teacher)
      }
      else if (item.Teachers_id) {
        // Junction table structure - teacher is nested
        const teacher = typeof item.Teachers_id === 'object' ? item.Teachers_id : teachers.value.find(t => t.id === item.Teachers_id)
        if (teacher)
          teacherList.push(teacher as Teacher)
      }
    }
  }

  return teacherList
}

// Get teacher full name
const getTeacherFullName = (teacher: Teacher) => {
  const middle = teacher.middle_name ? ` ${teacher.middle_name}.` : ''

  return `${teacher.first_name}${middle} ${teacher.last_name}`
}

// Get Dean from teachers list
const getDean = (department: Department): Teacher | null => {
  const teacherList = getTeachers(department)

  return teacherList.find(t => t.position?.toLowerCase() === 'dean') || null
}

// Get teacher count
const getTeacherCount = (department: Department): number => {
  return getTeachers(department).length
}

// Get class count for a department
const getClassCount = (department: Department): number => {
  if (!department.id)
    return 0

  return classes.value.filter((classItem) => {
    if (!classItem.department_id || !Array.isArray(classItem.department_id))
      return false

    return classItem.department_id.some((item: any) => {
      if (typeof item === 'number')
        return item === department.id
      if (typeof item === 'object' && item !== null)
        return (item.Department_id || item.id) === department.id
      return false
    })
  }).length
}

// Get list of Dean IDs already assigned to other departments
const getAssignedDeanIds = computed(() => {
  const assignedDeans: number[] = []

  for (const dept of departments.value) {
    // Skip current department being edited
    if (isEditing.value && dept.id === form.value.id)
      continue

    const dean = getDean(dept)
    if (dean)
      assignedDeans.push(dean.id)
  }

  return assignedDeans
})

// Get available teachers (excluding Deans already assigned to other departments)
const availableTeachers = computed(() => {
  return teachers.value.filter(teacher => {
    // If teacher is a Dean and already assigned to another department, exclude them
    if (teacher.position?.toLowerCase() === 'dean' && getAssignedDeanIds.value.includes(teacher.id))
      return false

    return true
  })
})

// Fetch departments from Directus
const fetchDepartments = async () => {
  isLoading.value = true
  try {
    const res = await $api('/items/Department', {
      params: {
        fields: ['*', 'name.*', 'teacher_id.*'],
      },
    })

    departments.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch departments:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Fetch programs for dropdown
const fetchPrograms = async () => {
  try {
    const res = await $api('/items/programs', {
      params: {
        fields: ['id', 'programCode', 'programName'],
        sort: 'programName',
      },
    })

    programs.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch programs:', error)
  }
}

// Fetch teachers for dropdown
const fetchTeachers = async () => {
  try {
    const res = await $api('/items/Teachers', {
      params: {
        fields: ['id', 'first_name', 'middle_name', 'last_name', 'position', 'email'],
        sort: 'last_name',
      },
    })

    teachers.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch teachers:', error)
  }
}

// Fetch classes for counting
const fetchClasses = async () => {
  try {
    const res = await $api('/items/classes', {
      params: {
        fields: ['id', 'department_id.*'],
      },
    })

    classes.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch classes:', error)
  }
}

// Open dialog for creating new department
const openCreateDialog = () => {
  isEditing.value = false
  form.value = {
    id: undefined,
    name: null,
    teacher_id: [],
  }
  isDialogOpen.value = true
}

// Open dialog for editing department
const openEditDialog = (department: Department) => {
  isEditing.value = true

  // Extract name as number
  const nameId = typeof department.name === 'object' && department.name !== null
    ? department.name.id
    : department.name

  // Extract teacher_ids as numbers - handle junction table structure
  const teacherIds: number[] = []
  if (department.teacher_id && Array.isArray(department.teacher_id)) {
    for (const item of department.teacher_id) {
      if (typeof item === 'number') {
        teacherIds.push(item)
      }
      else if (typeof item === 'object' && item !== null) {
        // Junction table structure: { id, Teachers_id } or direct teacher { id, first_name, ... }
        if (item.Teachers_id) {
          // Junction table - get the actual teacher ID
          const tid = typeof item.Teachers_id === 'object' ? item.Teachers_id.id : item.Teachers_id
          if (tid) teacherIds.push(tid)
        }
        else if (item.first_name) {
          // Direct teacher object
          teacherIds.push(item.id)
        }
      }
    }
  }

  form.value = {
    id: department.id,
    name: nameId,
    teacher_id: teacherIds,
  }

  isDialogOpen.value = true
}

// Open delete confirmation dialog
const openDeleteDialog = (department: Department) => {
  selectedDepartment.value = department
  isDeleteDialogOpen.value = true
}

// Save department (create or update)
const saveDepartment = async () => {
  try {
    // For M2M relationships, Directus needs junction table format
    const teacherRelations = form.value.teacher_id.map(id => ({
      Teachers_id: id,
    }))

    const body: any = {
      name: form.value.name,
      teacher_id: teacherRelations,
    }

    if (isEditing.value && form.value.id) {
      // Update existing department
      await $api(`/items/Department/${form.value.id}`, {
        method: 'PATCH',
        body,
      })
    }
    else {
      // Create new department
      await $api('/items/Department', {
        method: 'POST',
        body,
      })
    }

    isDialogOpen.value = false
    await fetchDepartments()
  }
  catch (error) {
    console.error('Failed to save department:', error)
  }
}

// Delete department
const deleteDepartment = async () => {
  if (!selectedDepartment.value?.id)
    return

  try {
    await $api(`/items/Department/${selectedDepartment.value.id}`, {
      method: 'DELETE',
    })

    isDeleteDialogOpen.value = false
    selectedDepartment.value = null
    await fetchDepartments()
  }
  catch (error) {
    console.error('Failed to delete department:', error)
  }
}

// Navigate to department detail page
const viewDepartmentDetails = (department: Department) => {
  if (department.id)
    router.push(`/departments/${department.id}`)
}

// Fetch data on mount
onMounted(() => {
  fetchDepartments()
  fetchPrograms()
  fetchTeachers()
  fetchClasses()
})
</script>

<template>
  <div>
    <VCard>
      <VCardTitle class="d-flex align-center pa-6">
        <span class="text-h5">Department Management</span>
        <VSpacer />
        <VTextField
          v-model="search"
          prepend-inner-icon="ri-search-line"
          placeholder="Search departments..."
          density="compact"
          variant="outlined"
          hide-details
          class="me-4"
          style="max-width: 300px;"
        />
        <VBtn
          color="primary"
          prepend-icon="ri-add-line"
          @click="openCreateDialog"
        >
          Add Department
        </VBtn>
      </VCardTitle>

      <VDivider />

      <VDataTable
        :headers="headers"
        :items="departments"
        :search="search"
        :loading="isLoading"
        hover
        class="clickable-rows"
        @click:row="(_event: Event, { item }: { item: Department }) => viewDepartmentDetails(item)"
      >
        <template #item.name="{ item }">
          <span class="font-weight-medium text-primary">{{ getDepartmentName(item) }}</span>
        </template>

        <template #item.dean="{ item }">
          <span v-if="getDean(item)" class="font-weight-medium">{{ getTeacherFullName(getDean(item)!) }}</span>
          <span v-else class="text-medium-emphasis">Not assigned</span>
        </template>

        <template #item.teacherCount="{ item }">
          <span :class="getTeacherCount(item) > 0 ? 'font-weight-medium' : 'text-medium-emphasis'">
            {{ getTeacherCount(item) }}
          </span>
        </template>

        <template #item.classCount="{ item }">
          <span :class="getClassCount(item) > 0 ? 'font-weight-medium' : 'text-medium-emphasis'">
            {{ getClassCount(item) }}
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
            <p class="text-body-1 text-medium-emphasis">No departments found</p>
          </div>
        </template>
      </VDataTable>
    </VCard>

    <!-- Create/Edit Dialog -->
    <VDialog
      v-model="isDialogOpen"
      max-width="500"
      persistent
    >
      <VCard>
        <VCardTitle class="pa-6">
          {{ isEditing ? 'Edit Department' : 'Add New Department' }}
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VRow>
            <VCol cols="12">
              <VAutocomplete
                v-model="form.name"
                label="Department Name (Program)"
                :items="programs"
                item-title="programName"
                item-value="id"
                variant="outlined"
                :rules="[v => !!v || 'Department name is required']"
                placeholder="Type to search programs..."
                no-data-text="No programs found"
              >
                <template #item="{ item, props }">
                  <VListItem v-bind="props">
                    <template #title>
                      {{ item.raw.programName }}
                    </template>
                    <template #subtitle>
                      {{ item.raw.programCode }}
                    </template>
                  </VListItem>
                </template>
              </VAutocomplete>
            </VCol>
            <VCol cols="12">
              <VAutocomplete
                v-model="form.teacher_id"
                label="Assign Teachers"
                :items="availableTeachers"
                :item-title="(item: Teacher) => getTeacherFullName(item)"
                item-value="id"
                variant="outlined"
                multiple
                chips
                closable-chips
                placeholder="Type to search teachers..."
                no-data-text="No teachers found"
                hint="Deans already assigned to other departments are not shown"
                persistent-hint
              >
                <template #item="{ item, props }">
                  <VListItem v-bind="props">
                    <template #title>
                      {{ getTeacherFullName(item.raw) }}
                      <VChip
                        v-if="item.raw.position?.toLowerCase() === 'dean'"
                        size="x-small"
                        color="warning"
                        class="ms-2"
                      >
                        Dean
                      </VChip>
                    </template>
                    <template #subtitle>
                      {{ item.raw.position }} • {{ item.raw.email }}
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
            :disabled="!form.name"
            @click="saveDepartment"
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
          Delete Department
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          Are you sure you want to delete <strong>{{ getDepartmentName(selectedDepartment!) }}</strong>?
          This action cannot be undone.
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
            @click="deleteDepartment"
          >
            Delete
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
