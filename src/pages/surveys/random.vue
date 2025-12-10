<script setup lang="ts">
const router = useRouter()

const goBack = () => {
  router.push('/surveys')
}
</script>

<template>
  <VCard>
    <VCardTitle class="pa-6">
      <div class="d-flex align-center">
        <VIcon icon="ri-shuffle-line" size="28" class="me-3" />
        <span class="text-h5">Random Page</span>
      </div>
    </VCardTitle>

    <VDivider />

    <VCardText class="pa-6">
      <p class="text-body-1 mb-4">
        This is a random page that is not listed in the navigation menu,
        but still has the vertical navigation visible.
      </p>

      <VBtn color="primary" prepend-icon="ri-arrow-left-line" @click="goBack">
        Back to Surveys
      </VBtn>
    </VCardText>
  </VCard>
</template>
