<script lang="ts" setup>
import adminNavItems from '@/navigation/vertical'
import deanNavItems from '@/navigation/vertical/dean'
import studentNavItems from '@/navigation/vertical/student'

// Components
import Footer from '@/layouts/components/Footer.vue'
import UserProfile from '@/layouts/components/UserProfile.vue'

// @layouts plugin
import { VerticalNavLayout } from '@layouts'

// State to force re-render when role changes
const userRole = ref('')

// Get navigation items based on user role
const navItems = computed(() => {
  // Access userRole to create reactive dependency
  const role = userRole.value

  if (role === 'dean') {
    return deanNavItems
  }
  else if (role === 'student') {
    return studentNavItems
  }

  // Default to admin navigation
  return adminNavItems
})

// Update role from cookie
const updateRole = () => {
  const userData = useCookie('userData').value as any

  // Handle different role formats
  let role = ''
  if (userData?.role) {
    if (typeof userData.role === 'string') {
      role = userData.role.toLowerCase()
    }
    else if (typeof userData.role === 'object') {
      role = (userData.role.name || userData.role.title || '').toLowerCase()
    }
  }

  // Also check for direct role property
  if (!role && userData?.userRole) {
    role = userData.userRole.toLowerCase()
  }

  userRole.value = role
}

// Update role on mount and watch for changes
onMounted(() => {
  updateRole()
})

// Watch for cookie changes
watch(() => useCookie('userData').value, () => {
  updateRole()
}, { deep: true })
</script>

<template>
  <VerticalNavLayout :nav-items="navItems">
    <!-- 👉 navbar -->
    <template #navbar="{ toggleVerticalOverlayNavActive }">
      <div class="d-flex h-100 align-center">
        <IconBtn
          id="vertical-nav-toggle-btn"
          class="ms-n2 d-lg-none"
          @click="toggleVerticalOverlayNavActive(true)"
        >
          <VIcon icon="ri-menu-line" />
        </IconBtn>

        <VSpacer />

        <UserProfile />
      </div>
    </template>

    <!-- 👉 Pages -->
    <slot />

    <!-- 👉 Footer -->
    <template #footer>
      <Footer />
    </template>
  </VerticalNavLayout>
</template>
