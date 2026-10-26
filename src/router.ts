import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('./views/HomeView.vue'),
    },
    {
      path: '/schedule',
      name: 'schedule',
      component: () => import('./views/ScheduleView.vue'),
    },
    {
      path: '/exams',
      name: 'exams',
      component: () => import('./views/ExamsView.vue'),
    },
    {
      path: '/spoc',
      name: 'spoc-list',
      component: () => import('./views/SpocListView.vue'),
    },
    {
      path: '/spoc/:assignmentId',
      name: 'spoc-detail',
      component: () => import('./views/SpocListView.vue'),
    },
    {
      path: '/bykc',
      name: 'bykc',
      component: () => import('./views/BykcView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('./views/SettingsView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

export default router
