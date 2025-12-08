<script setup lang="ts">
import { themeConfig } from '@themeConfig'
import { VNodeRenderer } from '@layouts/components/VNodeRenderer'

definePage({
  meta: {
    layout: 'blank',
    public: true,
  },
})
</script>

<template>
  <div class="landing-page">
    <!-- Navigation -->
    <VAppBar
      flat
      color="transparent"
      class="px-4"
    >
      <div class="d-flex align-center gap-x-3">
        <VNodeRenderer :nodes="themeConfig.app.logo" />
        <span class="text-h5 font-weight-bold text-primary">
          {{ themeConfig.app.title }}
        </span>
      </div>

      <VSpacer />

      <VBtn
        variant="text"
        color="primary"
        :to="{ name: 'login' }"
      >
        Login
      </VBtn>
      <VBtn
        color="primary"
        :to="{ name: 'register' }"
      >
        Get Started
      </VBtn>
    </VAppBar>

    <!-- Hero Section -->
    <VContainer class="hero-section">
      <VRow
        align="center"
        justify="center"
        class="min-h-screen"
      >
        <VCol
          cols="12"
          md="8"
          class="text-center"
        >
          <h1 class="text-h2 text-md-h1 font-weight-bold mb-4 text-primary">
            Create Surveys That Matter
          </h1>
          <p class="text-h6 text-medium-emphasis mb-8 mx-auto" style="max-width: 600px;">
            Build beautiful, engaging surveys in minutes. Collect responses and gain valuable insights with Survegio's powerful yet simple platform.
          </p>
          <div class="d-flex gap-4 justify-center flex-wrap">
            <VBtn
              size="x-large"
              color="primary"
              :to="{ name: 'register' }"
            >
              Start for Free
            </VBtn>
            <VBtn
              size="x-large"
              variant="outlined"
              color="primary"
              :to="{ name: 'login' }"
            >
              Sign In
            </VBtn>
          </div>
        </VCol>
      </VRow>
    </VContainer>

    <!-- Features Section -->
    <VContainer class="py-16">
      <VRow justify="center" class="mb-12">
        <VCol cols="12" class="text-center">
          <h2 class="text-h3 font-weight-bold mb-4">Why Choose Survegio?</h2>
          <p class="text-body-1 text-medium-emphasis">Everything you need to create and manage surveys effectively</p>
        </VCol>
      </VRow>

      <VRow>
        <VCol
          v-for="feature in features"
          :key="feature.title"
          cols="12"
          md="4"
        >
          <VCard
            flat
            class="pa-6 text-center h-100"
            color="grey-50"
          >
            <VIcon
              :icon="feature.icon"
              size="48"
              color="primary"
              class="mb-4"
            />
            <h3 class="text-h5 font-weight-bold mb-2">{{ feature.title }}</h3>
            <p class="text-body-2 text-medium-emphasis">{{ feature.description }}</p>
          </VCard>
        </VCol>
      </VRow>
    </VContainer>

    <!-- CTA Section -->
    <div class="cta-section py-16" style="background-color: rgb(var(--v-theme-primary));">
      <VContainer>
        <VRow justify="center">
          <VCol cols="12" md="8" class="text-center">
            <h2 class="text-h3 font-weight-bold mb-4 text-white">Ready to Get Started?</h2>
            <p class="text-body-1 mb-8 text-white" style="opacity: 0.9;">
              Join thousands of users who trust Survegio for their survey needs.
            </p>
            <VBtn
              size="x-large"
              color="secondary"
              :to="{ name: 'register' }"
            >
              Create Your First Survey
            </VBtn>
          </VCol>
        </VRow>
      </VContainer>
    </div>

    <!-- Footer -->
    <VContainer class="py-8">
      <VRow justify="center">
        <VCol cols="12" class="text-center">
          <p class="text-body-2 text-medium-emphasis">
            &copy; {{ new Date().getFullYear() }} Survegio. All rights reserved.
          </p>
        </VCol>
      </VRow>
    </VContainer>
  </div>
</template>

<script lang="ts">
const features = [
  {
    icon: 'ri-draft-line',
    title: 'Easy to Create',
    description: 'Build professional surveys with our intuitive drag-and-drop builder. No technical skills required.',
  },
  {
    icon: 'ri-bar-chart-box-line',
    title: 'Powerful Analytics',
    description: 'Get real-time insights with comprehensive analytics and beautiful visualizations.',
  },
  {
    icon: 'ri-share-line',
    title: 'Easy Sharing',
    description: 'Share your surveys via link, email, or embed them directly on your website.',
  },
]

export default {
  data() {
    return { features }
  },
}
</script>

<style lang="scss" scoped>
.landing-page {
  min-height: 100vh;
  background-color: rgb(var(--v-theme-background));
}

.hero-section {
  min-height: calc(100vh - 64px);
  display: flex;
  align-items: center;
}
</style>
