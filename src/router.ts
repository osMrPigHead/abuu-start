import { createRouter, createWebHashHistory } from "vue-router";

const router = createRouter({
  // 扩展页面是静态 HTML，路径不能由服务器回退，因此使用 hash 模式。
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      component: () => import("./views/HomeView.vue"),
    },
    {
      path: "/schedule",
      name: "schedule",
      component: () => import("./views/ScheduleView.vue"),
    },
    {
      path: "/exams",
      name: "exams",
      component: () => import("./views/ExamsView.vue"),
    },
    {
      path: "/spoc",
      name: "spoc-list",
      component: () => import("./views/SpocListView.vue"),
    },
    {
      path: "/spoc/:assignmentId",
      name: "spoc-detail",
      component: () => import("./views/SpocListView.vue"),
    },
    {
      path: "/bykc",
      name: "bykc",
      component: () => import("./views/BykcView.vue"),
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("./views/SettingsView.vue"),
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/",
    },
  ],
});

export default router;
