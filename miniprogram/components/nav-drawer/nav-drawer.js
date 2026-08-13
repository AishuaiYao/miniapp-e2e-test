Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    currentPath: {
      type: String,
      value: ''
    }
  },

  data: {
    drawerHeaderPaddingTop: 40,
    menuItems: [
      { name: '主页', icon: '🏠', path: '/pages/index/index' },
      { name: '我的账本', icon: '📒', path: '/pages/notebooks/notebooks' },
      { name: '我的账号', icon: '👤', path: '/pages/account/account' }
    ]
  },

  lifetimes: {
    attached() {
      var app = getApp()
      var layout = app.getNavBarLayout ? app.getNavBarLayout() : {}
      var statusBarHeight = layout.statusBarHeight || 20
      this.setData({
        drawerHeaderPaddingTop: statusBarHeight + 20
      })
    }
  },

  methods: {
    close() {
      this.triggerEvent('close')
    },

    navigate(e) {
      var path = e.currentTarget.dataset.path
      this.triggerEvent('navigate', { path: path })
      this.close()
    },

    preventMove() {
      return false
    }
  }
})
