export default [
  {
    name: 'session',
    icon: 'table',
    path: '/session',
    component: './Session',
    menuRender: false
  },
  {
    path: '/',
    redirect: '/session',
  },
  {
    path: '/static/session',
    redirect: '/session',
  },
  {
    redirect: '/session',
    // component: './404',
  },
];
