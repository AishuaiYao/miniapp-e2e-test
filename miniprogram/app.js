App({
  globalData: {
    aliyunApiKey: null,
    userInfo: null,
    currentNotebookId: '',
    currentNotebookName: '',
    statusBarHeight: 0,
    navBarHeight: 0,
    navTotalHeight: 0
  },

  onLaunch: function () {
    wx.cloud.init({
      env: 'cloud1-d7g1myj7ab00b5661'
    })

    // 计算导航栏尺寸
    this.initNavBar()

    // 加载缓存的用户信息
    this.loadUserInfo()

    // 加载当前账本
    this.loadCurrentNotebook()

    // 通过云函数获取阿里云 API Key
    this.loadAliyunApiKey()
  },

  // ========== 导航栏尺寸 ==========

  initNavBar: function () {
    try {
      var windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      var menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null

      var statusBarHeight = windowInfo.statusBarHeight || 20
      var navBarHeight = 44

      if (menuButton && menuButton.height) {
        navBarHeight = (menuButton.top - statusBarHeight) * 2 + menuButton.height
      }

      this.globalData.statusBarHeight = statusBarHeight
      this.globalData.navBarHeight = navBarHeight
      this.globalData.navTotalHeight = statusBarHeight + navBarHeight
    } catch (e) {
      console.error('初始化导航栏尺寸失败:', e)
      this.globalData.statusBarHeight = 20
      this.globalData.navBarHeight = 44
      this.globalData.navTotalHeight = 64
    }
  },

  getNavBarLayout: function () {
    if (!this.globalData.navTotalHeight) {
      this.initNavBar()
    }
    return {
      statusBarHeight: this.globalData.statusBarHeight,
      navBarHeight: this.globalData.navBarHeight,
      navTotalHeight: this.globalData.navTotalHeight
    }
  },

  // ========== 用户信息管理 ==========

  loadUserInfo: function () {
    var userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      this.globalData.userInfo = userInfo
    }
  },

  setUserInfo: function (userInfo) {
    this.globalData.userInfo = userInfo
    if (userInfo) {
      wx.setStorageSync('userInfo', userInfo)
    } else {
      wx.removeStorageSync('userInfo')
    }
  },

  getUserInfo: function () {
    return this.globalData.userInfo
  },

  // ========== 账本管理 ==========

  loadCurrentNotebook: function () {
    var id = wx.getStorageSync('currentNotebookId')
    var name = wx.getStorageSync('currentNotebookName')
    if (id) {
      this.globalData.currentNotebookId = id
      this.globalData.currentNotebookName = name || ''
    }
  },

  setCurrentNotebook: function (id, name) {
    this.globalData.currentNotebookId = id
    this.globalData.currentNotebookName = name || ''
    if (id) {
      wx.setStorageSync('currentNotebookId', id)
      wx.setStorageSync('currentNotebookName', name || '')
    } else {
      wx.removeStorageSync('currentNotebookId')
      wx.removeStorageSync('currentNotebookName')
    }
  },

  getCurrentNotebookId: function () {
    return this.globalData.currentNotebookId
  },

  getCurrentNotebookName: function () {
    return this.globalData.currentNotebookName
  },

  // ========== 阿里云 API Key ==========

  loadAliyunApiKey: function () {
    var that = this
    console.log('[app] 调用云函数 getConfig 获取 API Key')

    wx.cloud.callFunction({
      name: 'getConfig',
      success: function (res) {
        console.log('[app] getConfig 返回:', JSON.stringify(res.result))
        if (res.result && res.result.success) {
          that.globalData.aliyunApiKey = res.result.apiKey
          console.log('[app] aliyun_api_key 已加载, 长度:', that.globalData.aliyunApiKey.length)
        } else {
          console.error('[app] 获取 API Key 失败:', res.result)
        }
      },
      fail: function (err) {
        console.error('[app] 调用 getConfig 失败:', err)
      }
    })
  },

  getAliyunApiKey: function () {
    return this.globalData.aliyunApiKey
  }
})
