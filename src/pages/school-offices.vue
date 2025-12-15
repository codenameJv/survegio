<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'school-offices',
  },
})

interface SchoolOffice {
  id?: number
  name: string
  description: string
  is_active: boolean
}

// State
const offices = ref<SchoolOffice[]>([])
const isLoading = ref(false)
const isDialogOpen = ref(false)
const isDeleteDialogOpen = ref(false)
const isEditing = ref(false)
const isSaving = ref(false)
const selectedOffice = ref<SchoolOffice | null>(null)
const search = ref('')

const form = ref<SchoolOffice>({
  name: '',
  description: '',
  is_active: true,
})

// Table headers
const headers = [
  { title: 'Office Name', key: 'name', sortable: true },
  { title: 'Status', key: 'is_active', sortable: true, align: 'center' as const },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' as const },
]

// Fetch offices from Directus
const fetchOffices = async () => {
  isLoading.value = true
  try {
    const res = await $api('/items/SchoolOffices', {
      params: {
        sort: ['name'],
      },
    })
    offices.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch school offices:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Open dialog for creating new office
const openCreateDialog = () => {
  isEditing.value = false
  form.value = {
    name: '',
    description: '',
    is_active: true,
  }
  isDialogOpen.value = true
}

// Open dialog for editing office
const openEditDialog = (office: SchoolOffice) => {
  isEditing.value = true
  form.value = {
    id: office.id,
    name: office.name,
    description: office.description || '',
    is_active: office.is_active ?? true,
  }
  isDialogOpen.value = true
}

// Open delete confirmation dialog
const openDeleteDialog = (office: SchoolOffice) => {
  selectedOffice.value = office
  isDeleteDialogOpen.value = true
}

// Save office (create or update)
const saveOffice = async () => {
  if (!form.value.name.trim()) return

  isSaving.value = true
  try {
    const body = {
      name: form.value.name,
      description: form.value.description,
      is_active: form.value.is_active,
    }

    if (isEditing.value && form.value.id) {
      await $api(`/items/SchoolOffices/${form.value.id}`, {
        method: 'PATCH',
        body,
      })
    }
    else {
      await $api('/items/SchoolOffices', {
        method: 'POST',
        body,
      })
    }

    isDialogOpen.value = false
    await fetchOffices()
  }
  catch (error) {
    console.error('Failed to save school office:', error)
  }
  finally {
    isSaving.value = false
  }
}

// Delete office
const deleteOffice = async () => {
  if (!selectedOffice.value?.id) return

  try {
    await $api(`/items/SchoolOffices/${selectedOffice.value.id}`, {
      method: 'DELETE',
    })

    isDeleteDialogOpen.value = false
    selectedOffice.value = null
    await fetchOffices()
  }
  catch (error) {
    console.error('Failed to delete school office:', error)
  }
}

// Toggle office status
const toggleStatus = async (office: SchoolOffice) => {
  try {
    await $api(`/items/SchoolOffices/${office.id}`, {
      method: 'PATCH',
      body: { is_active: !office.is_active },
    })
    await fetchOffices()
  }
  catch (error) {
    console.error('Failed to update office status:', error)
  }
}

// Fetch data on mount
onMounted(() => {
  fetchOffices()
})
</script>

<template>
  <div>
    <VCard>
      <VCardTitle class="d-flex align-center pa-6">
        <span class="text-h5">School Offices</span>
        <VSpacer />
        <VTextField
          v-model="search"
          prepend-inner-icon="ri-search-line"
          placeholder="Search offices..."
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
          Add Office
        </VBtn>
      </VCardTitle>

      <VDivider />

      <VDataTable
        :headers="headers"
        :items="offices"
        :search="search"
        :loading="isLoading"
        hover
      >
        <template #item.name="{ item }">
          <span class="font-weight-medium">{{ item.name }}</span>
        </template>

        <template #item.is_active="{ item }">
          <VChip
            :color="item.is_active ? 'success' : 'error'"
            size="small"
            variant="tonal"
            class="cursor-pointer"
            @click="toggleStatus(item)"
          >
            {{ item.is_active ? 'Active' : 'Inactive' }}
          </VChip>
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
          <div class="text-center pa-8">
            <VIcon icon="ri-building-2-line" size="64" color="medium-emphasis" class="mb-4" />
            <p class="text-h6 text-medium-emphasis mb-2">No School Offices</p>
            <p class="text-body-2 text-medium-emphasis mb-4">
              Add offices like Registrar, Cashier, Library, etc. for students to evaluate.
            </p>
            <VBtn
              color="primary"
              prepend-icon="ri-add-line"
              @click="openCreateDialog"
            >
              Add Office
            </VBtn>
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
          {{ isEditing ? 'Edit School Office' : 'Add New School Office' }}
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VRow>
            <VCol cols="12">
              <VTextField
                v-model="form.name"
                label="Office Name"
                placeholder="e.g., Registrar, Cashier, Library"
                variant="outlined"
                :rules="[v => !!v || 'Office name is required']"
              />
            </VCol>
            <VCol cols="12">
              <VSwitch
                v-model="form.is_active"
                label="Active"
                color="success"
                hide-details
              />
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
            :disabled="!form.name.trim()"
            :loading="isSaving"
            @click="saveOffice"
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
          Delete School Office
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          Are you sure you want to delete <strong>{{ selectedOffice?.name }}</strong>?
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
            @click="deleteOffice"
          >
            Delete
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
