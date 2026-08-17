App({
  globalData: {
    aliyunApiKey: null,
    userInfo: null,
    currentNotebookId: '',
    currentNotebookName: '',
    statusBarHeight: 0,
    navBarHeight: 0,
    navTotalHeight: 0,
    pendingInviteId: '',          // 待处理的邀请 ID（登录后继续）
    onLoginSuccess: null          // 登录成功回调（用于邀请流程）
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
      // 胶囊按钮位置（right = 距屏幕右边缘 px，width = 按钮宽度 px），用于自定义导航栏右侧让位
      this.globalData.menuButtonRight = menuButton ? menuButton.right : 0
      this.globalData.menuButtonWidth = menuButton ? menuButton.width : 0
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
      navTotalHeight: this.globalData.navTotalHeight,
      menuButtonRight: this.globalData.menuButtonRight || 0,
      menuButtonWidth: this.globalData.menuButtonWidth || 0
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
      this.recordRecentNotebook(id, name)
    } else {
      wx.removeStorageSync('currentNotebookId')
      wx.removeStorageSync('currentNotebookName')
    }
  },

  // 本地记录最近使用过的账本（云端 lastUsedAt 缺失时的兜底，不依赖云函数是否已部署）
  recordRecentNotebook: function (id, name) {
    if (!id) return
    var list = wx.getStorageSync('recentNotebooks') || []
    list = list.filter(function (item) { return item.id !== id })
    list.unshift({ id: id, name: name || '', time: Date.now() })
    if (list.length > 20) list = list.slice(0, 20)
    wx.setStorageSync('recentNotebooks', list)
  },

  getCurrentNotebookId: function () {
    return this.globalData.currentNotebookId
  },

  getCurrentNotebookName: function () {
    return this.globalData.currentNotebookName
  },

  // 本地无当前账本时，恢复最近使用的账本（优先本地记录，其次云端）
  ensureRecentNotebook: function (callback) {
    var that = this
    var cb = callback || function () {}
    if (this.globalData.currentNotebookId) {
      cb(this.globalData.currentNotebookId)
      return
    }
    // 优先用本地最近使用记录，不依赖云端 lastUsedAt 是否已写入
    var recent = wx.getStorageSync('recentNotebooks') || []
    if (recent.length > 0) {
      var top = recent[0]
      this.setCurrentNotebook(top.id, top.name)
      this.touchCurrentNotebook(top.id)
      cb(top.id)
      return
    }
    var userInfo = this.getUserInfo()
    if (!userInfo || !userInfo.openId) {
      cb('')
      return
    }
    wx.cloud.callFunction({
      name: 'team',
      data: { action: 'getNotebooks' },
      success: function (res) {
        var result = res.result
        if (!result || !result.success || !result.notebooks || result.notebooks.length === 0) {
          cb('')
          return
        }
        // 按最近使用/创建时间倒序，取最新一个
        var list = result.notebooks.slice()
        list.sort(function (a, b) {
          return that.notebookSortTime(b) - that.notebookSortTime(a)
        })
        var nb = list[0]
        that.setCurrentNotebook(nb._id, nb.name)
        that.touchCurrentNotebook(nb._id)
        cb(nb._id)
      },
      fail: function () {
        cb('')
      }
    })
  },

  // 记录账本最近使用时间（云端 lastUsedAt）
  touchCurrentNotebook: function (notebookId) {
    if (!notebookId) return
    wx.cloud.callFunction({
      name: 'team',
      data: { action: 'touchNotebook', notebookId: notebookId },
      fail: function (err) {
        console.error('[app] 记录账本使用时间失败:', err)
      }
    })
  },

  // 账本排序时间：优先 lastUsedAt，没有则用 createdAt
  notebookSortTime: function (nb) {
    if (nb.lastUsedAt) return nb.lastUsedAt
    var t = Date.parse(nb.createdAt)
    return t ? t : 0
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
